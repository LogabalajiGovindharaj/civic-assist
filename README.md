# Civic Assist — Government Emergency & Banking RAG Assistant
      https://civic-assist-uaj6.onrender.com

A standalone Node.js/Express app with two grounded assistants:

- **Government & Emergency Services** — emergency SOPs, nearest hospital/police/fire/gas
  office (via geolocation), and government document procedures.
- **Banking & Financial Services** — RBI ATM/UPI dispute rules, loan foreclosure rules,
  fraud red-flag detection, and nearest bank branch/ATM.

Both are grounded in a small curated set of real documents (see `server/data/docs/`) and
refuse to answer rather than guess when nothing in the knowledge base is a good match.
This is the scoped, solo-buildable version of the enterprise spec — see the "What was
cut" section below.

## Quick start

```bash
cd civic-assist
npm install
cp .env.example .env
# edit .env and paste a free Gemini API key from https://aistudio.google.com/app/apikey
npm start
```

Open https://civic-assist-uaj6.onrender.com — it will redirect to a login/sign-up page (any username/password
works, it's your own local account, stored hashed in `server/data/users.json`).

**No API key yet?** The app still runs. Without `GEMINI_API_KEY` set, each assistant
falls back to returning the best-matching document chunk directly instead of an
LLM-composed answer, so you can demo the retrieval + confidence-gate + location logic
immediately, then add the key later for full natural-language answers.

## How it works

```
Browser (login → dashboard → pick a window → chat)
        │
        ▼
Express server (server/index.js)
        │
        ├─ Session auth (server/lib/users.js) — JSON file, bcrypt-hashed passwords
        │
        ├─ Retrieval (server/lib/retrieval.js)
        │     Local TF-IDF cosine-similarity search over small .txt documents,
        │     tagged per assistant via folder: server/data/docs/govt_emergency/,
        │     server/data/docs/banking/. No external embeddings API needed.
        │
        ├─ Confidence gate (server/lib/assistants.js + index.js)
        │     Refuses to answer unless the best match clears BOTH a minimum
        │     TF-IDF score AND a minimum shared-term overlap - guards against
        │     one common word (e.g. "fee") falsely tripping confidence in a
        │     small demo corpus.
        │
        ├─ Emergency / fraud keyword detection (server/lib/assistants.js)
        │     Disaster keywords (gas leak, fire, flood, earthquake, medical,
        │     accident) trigger a structured "Emergency Level / Call X /
        │     Nearest Office" response. Fraud-signal phrases (guaranteed
        │     returns, OTP requests, etc.) trigger a fraud red-flag block.
        │
        ├─ Haversine distance (server/lib/haversine.js)
        │     Pure math, no external maps API or key. "Nearest office" is
        │     computed against your own small offices table
        │     (server/data/offices.json). Map links are just the free
        │     https://maps.google.com/?q={lat},{lon} URL pattern.
        │
        └─ Gemini (server/lib/gemini.js)
              Calls the free-tier gemini-1.5-flash model, given ONLY the
              retrieved document chunks as context, to compose the final
              answer. Falls back gracefully if no key is set (see above).
```

The browser asks for location permission on the assistant page (`navigator.geolocation`)
and shows a status pill ("Location on/off/denied"). If denied, nearest-office lookups
are simply skipped rather than the app breaking.

## Project layout

```
civic-assist/
  server/
    index.js              Express app + all routes
    lib/
      assistants.js       Prompt configs, confidence threshold, keyword detectors
      retrieval.js         Local TF-IDF retrieval engine
      gemini.js            Gemini API call + offline fallback
      haversine.js         Distance math + nearest-office lookup
      users.js             JSON-file user store (signup/login)
    data/
      offices.json         Seed: ~19 real Chennai offices/branches/ATMs (edit for your city)
      emergency_contacts.json  Seed: real public India-wide helpline numbers
      users.json            Created at runtime, holds hashed passwords
      docs/
        govt_emergency/     5 sample govt/emergency documents (RAG source)
        banking/             4 sample banking/RBI documents (RAG source)
  public/                  Login, dashboard, and chat frontend (vanilla HTML/CSS/JS)
```

## Adding your own documents or offices

- Drop a new `.txt` file into `server/data/docs/govt_emergency/` or `.../banking/` and
  restart the server — it's indexed automatically. Keep each fact in its own paragraph
  (blank-line separated) since that's the retrieval chunk boundary.
- Add rows to `server/data/offices.json` for your own city/district (real public data —
  hospital, police, fire station, bank branch, ATM locations). Use `category` values that
  match: `hospital`, `police`, `fire`, `gas`, `electricity`, `bank_branch`, `atm`,
  `collector`, `aadhaar`, `passport`, `veterinary`.

## What was scoped down from the original enterprise spec (intentionally)

| Original ask | This build |
|---|---|
| Google Maps API, ISRO Bhuvan satellite | Free `maps.google.com/?q=` links + browser geolocation — no paid API/key |
| Live NSE/BSE market data, IPO status | Cut — this is a policy/procedure RAG assistant, not a trading platform |
| 30+ banks, full product catalogs | 4 curated RBI policy documents proving the retrieval + compensation-rule pattern |
| OCR, speech recognition | Not included — can be added later via the browser's free Web Speech API |
| pgvector / real embeddings | Local TF-IDF cosine similarity — zero-dependency, works offline, good enough for a small curated corpus |

This mirrors how a real team ships a v1: prove the architecture with free tools and a
curated dataset before adding paid, large-scale integrations.

## Try these test queries

- "There's a gas leak in my house, what do I do?" → emergency block + nearest gas office
- "How do I apply for a birth certificate?" → RAG answer from `birth_certificate.txt`
- "ATM took money but didn't give cash" → RBI 5-day/₹100-per-day compensation rule + nearest branch
- "Someone offered me 12% monthly guaranteed returns" → fraud red-flag block, never "confirmed safe"
- "What's the passport fee for tatkal service?" → refuses (not in the document set) instead of guessing

## Security notes for anything beyond a personal demo

This is scoped for a solo/demo build: passwords are bcrypt-hashed but stored in a plain
JSON file, and sessions use an in-memory store (fine for one process, not for scaling
across multiple server instances). Before using this with real users' data, move to a
real database and a persistent session store.
