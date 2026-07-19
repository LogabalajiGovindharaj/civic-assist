const params = new URLSearchParams(window.location.search);
const assistantId = params.get("assistant") === "banking" ? "banking" : "govt_emergency";

const LABELS = {
  govt_emergency: "Government & Emergency Services",
  banking: "Banking & Financial Services",
};
const GREETINGS = {
  govt_emergency:
    "I can help with emergency guidance, nearby hospitals/police/fire stations, and government document procedures. If it's a live emergency, say what's happening — for example \"gas leak in my house\".",
  banking:
    "I can help with ATM/UPI failed transactions, loan foreclosure rules, nearest bank branch or ATM, and flagging fraud red flags. What's going on?",
};
const SAMPLE_PROMPTS = {
  govt_emergency: [
    "There's a gas leak in my house, what do I do?",
    "How do I apply for a birth certificate?",
    "What should I do during a flood?",
    "How do I get a driving licence?",
    "Nearest hospital near me",
  ],
  banking: [
    "ATM took money but didn't give cash, what happens?",
    "My UPI payment failed but money was debited",
    "Explain home loan foreclosure charges",
    "Someone offered me 12% monthly guaranteed returns, is that safe?",
    "Nearest bank branch near me",
  ],
};

document.getElementById("assistantLabel").textContent = LABELS[assistantId];

let userLocation = null; // {lat, lon}

const chatShell = document.getElementById("chatShell");
const locationPill = document.getElementById("locationPill");

function setLocationPill(state) {
  if (state === "on") {
    locationPill.className = "location-pill on";
    locationPill.innerHTML = '<span class="dot"></span> Location on';
  } else if (state === "denied") {
    locationPill.className = "location-pill off";
    locationPill.innerHTML = '<span class="dot"></span> Location denied — nearest-office lookup unavailable';
  } else {
    locationPill.className = "location-pill off";
    locationPill.innerHTML = '<span class="dot"></span> Location off';
  }
}

function requestLocation() {
  if (!navigator.geolocation) {
    setLocationPill("denied");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      setLocationPill("on");
    },
    () => setLocationPill("denied"),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function addMessage(role, html, extraClass = "") {
  const div = document.createElement("div");
  div.className = `msg ${role} ${extraClass}`.trim();
  div.innerHTML = html;
  chatShell.appendChild(div);
  window.scrollTo(0, document.body.scrollHeight);
  return div;
}

function officeChipsHtml(offices) {
  if (!offices || offices.length === 0) return "";
  return offices
    .map(
      (o) => `<div class="office-chip">
        <strong>${o.name}</strong> &middot; ${o.hours || ""}${o.phone ? " &middot; " + o.phone : ""}
        <div class="dist">${o.distance_km} km away</div>
        <div class="chip-links">
          <a href="${o.map_link}" target="_blank" rel="noopener">Open in Google Maps</a>
          <a href="${o.bhuvan_link}" target="_blank" rel="noopener">View on ISRO Bhuvan</a>
        </div>
      </div>`
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function sendMessage(text) {
  addMessage("user", escapeHtml(text));

  const thinking = addMessage("bot", "Checking official documents…");

  try {
    const res = await fetch(`/api/assistant/${assistantId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        lat: userLocation ? userLocation.lat : null,
        lon: userLocation ? userLocation.lon : null,
      }),
    });
    const data = await res.json();
    thinking.remove();

    if (!res.ok) {
      addMessage("bot", escapeHtml(data.error || "Something went wrong."));
      return;
    }

    const isEmergency = data.structured && data.structured.type === "emergency";
    const isFraud = data.structured && data.structured.type === "fraud_flag";
    const extraClass = isEmergency ? "emergency" : isFraud ? "fraud" : "";

    let html = "";
    if (isEmergency) {
      html += `<div style="font-weight:600; color:var(--brick); margin-bottom:6px;">⚠ EMERGENCY — Call ${data.structured.call_number} now</div>`;
    }
    if (isFraud) {
      html += `<div style="font-weight:600; color:var(--saffron); margin-bottom:6px;">🚩 Fraud red-flag check</div>`;
    }
    html += escapeHtml(data.answer).replace(/\n/g, "<br>");

    if (!userLocation && (isEmergency || (data.nearest_offices && data.nearest_offices.length === 0))) {
      html += `<div class="msg-meta">Turn on location to see the nearest office/branch for this.</div>`;
    }

    const officesToShow = data.nearest_offices || [];
    if (officesToShow.length > 0) {
      html += officeChipsHtml(officesToShow);
    }
    if (data.coverage_note) {
      html += `<div class="msg-meta coverage-note">📍 ${escapeHtml(data.coverage_note)}</div>`;
    }

    if (!data.confident && !data.structured) {
      html += `<div class="msg-meta">confidence: ${data.confidence} (below verification threshold)</div>`;
    } else if (data.sources && data.sources.length > 0) {
      html += `<div class="msg-meta">source: ${data.sources[0].source} · match score ${data.sources[0].score}</div>`;
    }

    addMessage("bot", html, extraClass);
  } catch (err) {
    thinking.remove();
    addMessage("bot", "Could not reach the server. Please try again.");
  }
}

document.getElementById("composerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  sendMessage(text);
});

function renderSamplePrompts() {
  const wrap = document.createElement("div");
  wrap.className = "sample-prompts";
  wrap.innerHTML = `<div class="sample-prompts-label">Try asking:</div>`;
  SAMPLE_PROMPTS[assistantId].forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "prompt-chip";
    btn.textContent = p;
    btn.addEventListener("click", () => {
      wrap.remove();
      sendMessage(p);
    });
    wrap.appendChild(btn);
  });
  chatShell.appendChild(wrap);
}

// ---------- Init ----------
(async function init() {
  const me = await fetch("/api/auth/me").then((r) => r.json());
  if (!me.user) {
    window.location.href = "/login.html";
    return;
  }
  requestLocation();
  addMessage("bot", escapeHtml(GREETINGS[assistantId]));
  renderSamplePrompts();
})();
