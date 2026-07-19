require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const cors = require("cors");

const { createUser, verifyUser } = require("./lib/users");
const { nearestOffices } = require("./lib/haversine");
const { generateGroundedAnswer } = require("./lib/gemini");
const {
  ASSISTANTS,
  CONFIDENCE_THRESHOLD,
  getIndex,
  detectEmergency,
  detectFraudSignal,
  detectQueryOfficeCategory,
  EMERGENCY_CATEGORY_TO_OFFICE_CATEGORY,
  EMERGENCY_CATEGORY_TO_NUMBER,
} = require("./lib/assistants");

const app = express();
const PORT = process.env.PORT || 3000;

const OFFICES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "offices.json"), "utf-8")
);
const EMERGENCY_CONTACTS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "emergency_contacts.json"), "utf-8")
);

// This demo ships with real offices for only Chennai and Karur. If the
// closest match is still far away, say so plainly instead of implying it's
// actually nearby - add your own city's offices to offices.json to fix this.
function coverageNoteFor(offices) {
  if (!offices || offices.length === 0) return null;
  if (offices[0].distance_km > 50) {
    return `This demo's office database only covers Chennai and Karur so far, so the closest match shown is ${offices[0].distance_km} km away - add your own city's real offices to server/data/offices.json for accurate results near you.`;
  }
  return null;
}

app.use(cors());
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
  })
);

// ---------- Auth ----------

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in." });
  next();
}

app.post("/api/auth/signup", (req, res) => {
  const { username, mobile, password } = req.body || {};
  if (!username || !mobile || !password || password.length < 4) {
    return res.status(400).json({ error: "Username, mobile number, and a password (min 4 chars) are required." });
  }
  try {
    const user = createUser(username.trim(), mobile.trim(), password);
    req.session.user = user;
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { identifier, password } = req.body || {};
  const user = verifyUser(identifier || "", password || "");
  if (!user) return res.status(401).json({ error: "Invalid username/mobile number or password." });
  req.session.user = user;
  res.json({ user });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

// ---------- Static reference data ----------

app.get("/api/emergency-contacts", requireAuth, (req, res) => {
  res.json(EMERGENCY_CONTACTS);
});

app.get("/api/offices/nearest", requireAuth, (req, res) => {
  const { lat, lon, category, limit } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: "lat and lon query params are required." });
  const results = nearestOffices(parseFloat(lat), parseFloat(lon), OFFICES, {
    category: category || null,
    limit: limit ? parseInt(limit, 10) : 5,
  });
  res.json(results);
});

// One-call "at a glance" panel: nearest office for each commonly-needed
// service (Aadhaar, driving licence/RTO, hospital, police, etc.), so people
// can see what's near them without having to know what to ask for.
const ESSENTIAL_CATEGORIES = [
  { category: "aadhaar", label: "Aadhaar Centre" },
  { category: "rto", label: "Driving Licence (RTO)" },
  { category: "passport", label: "Passport Seva Kendra" },
  { category: "hospital", label: "Hospital" },
  { category: "police", label: "Police Station" },
  { category: "fire", label: "Fire Station" },
  { category: "bank_branch", label: "Bank Branch" },
  { category: "atm", label: "ATM" },
  { category: "electricity", label: "Electricity Office" },
  { category: "gas", label: "LPG Gas Agency" },
  { category: "collector", label: "Collectorate" },
];

app.get("/api/offices/essentials", requireAuth, (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: "lat and lon query params are required." });
  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);

  const results = ESSENTIAL_CATEGORIES.map(({ category, label }) => {
    const matches = nearestOffices(userLat, userLon, OFFICES, { category, limit: 1 });
    return { category, label, office: matches[0] || null };
  });

  res.json(results);
});

// ---------- Assistant chat ----------

app.get("/api/assistants", requireAuth, (req, res) => {
  res.json(Object.values(ASSISTANTS).map((a) => ({ id: a.id, label: a.label })));
});

app.post("/api/assistant/:assistantId/chat", requireAuth, async (req, res) => {
  const { assistantId } = req.params;
  const { message, lat, lon } = req.body || {};

  const config = ASSISTANTS[assistantId];
  if (!config) return res.status(404).json({ error: "Unknown assistant." });
  if (!message || !message.trim()) return res.status(400).json({ error: "message is required." });

  try {
    const index = getIndex(assistantId);
    const topChunks = index.search(message, 3);
    const bestScore = topChunks.length ? topChunks[0].score : 0;
    const bestOverlap = topChunks.length ? topChunks[0].overlap : 0;
    // Require both a minimum cosine score AND at least 2 distinct shared
    // terms with the query - guards against a single common word (e.g. "fee")
    // falsely tripping the gate in a small demo corpus.
    const confident = bestScore >= CONFIDENCE_THRESHOLD && bestOverlap >= 2;

    let structured = null;

    // --- Government assistant: disaster / emergency keyword detection ---
    if (assistantId === "govt_emergency") {
      const emergencyCategory = detectEmergency(message);
      if (emergencyCategory) {
        const officeCategory = EMERGENCY_CATEGORY_TO_OFFICE_CATEGORY[emergencyCategory];
        const number = EMERGENCY_CATEGORY_TO_NUMBER[emergencyCategory];
        const nearby =
          lat && lon
            ? nearestOffices(parseFloat(lat), parseFloat(lon), OFFICES, {
                category: officeCategory,
                limit: 3,
              })
            : [];
        structured = {
          type: "emergency",
          emergency_level: "Critical",
          call_number: number,
          nearest_offices: nearby,
          location_used: !!(lat && lon),
        };
      }
    }

    // --- Banking assistant: fraud red-flag detection ---
    if (assistantId === "banking") {
      const fraudSignal = detectFraudSignal(message);
      if (fraudSignal) {
        structured = { type: "fraud_flag" };
      }
    }

    let answer;
    if (!confident && !structured) {
      answer =
        "I don't have verified information on this in my current documents, so I won't guess. " +
        "Please rephrase, or contact the relevant department/bank helpline directly for an authoritative answer.";
    } else {
      answer = await generateGroundedAnswer({
        systemPrompt: config.systemPrompt,
        userQuery: message,
        contextChunks: topChunks,
      });
    }

    let nearestForReply = [];
    if (!structured && lat && lon) {
      // Only surface office suggestions when the query is actually about a
      // matching category (e.g. "driving licence" -> RTO). Showing whatever
      // happens to be geographically closest regardless of relevance (an
      // ATM for a driving-licence question, say) is misleading, not helpful.
      const relevantCategory = detectQueryOfficeCategory(message) || config.officeCategoryDefault;
      if (relevantCategory) {
        nearestForReply = nearestOffices(parseFloat(lat), parseFloat(lon), OFFICES, {
          category: relevantCategory,
          limit: 3,
        });
      }
    }

    res.json({
      answer,
      confidence: Math.round(bestScore * 1000) / 1000,
      confident,
      sources: topChunks.map((c) => ({ source: c.source, score: Math.round(c.score * 1000) / 1000 })),
      structured,
      nearest_offices: structured ? structured.nearest_offices || [] : nearestForReply,
      coverage_note: coverageNoteFor(structured ? structured.nearest_offices : nearestForReply),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong generating the answer.", detail: err.message });
  }
});

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`Civic Assist server running at http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log("NOTE: GEMINI_API_KEY is not set - running in retrieval-only fallback mode. See .env.example.");
  }
});
