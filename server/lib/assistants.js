const path = require("path");
const { RetrievalIndex } = require("./retrieval");

const DOCS_ROOT = path.join(__dirname, "..", "data", "docs");

// Confidence gate thresholds. These are tuned for the TF-IDF cosine-similarity
// scale used by RetrievalIndex (typically 0.05-0.6 for a real match), NOT the
// 0-1 embedding-cosine scale referenced in the original enterprise spec.
// Both assistants get a strict/high threshold relative to that scale, because
// wrong emergency or financial info carries real-world harm — refuse rather
// than guess when nothing in the knowledge base is a good match.
const CONFIDENCE_THRESHOLD = 0.12;

const EMERGENCY_KEYWORDS = {
  gas: ["gas leak", "gas smell", "lpg leak"],
  fire: ["fire", "burning", "smoke everywhere"],
  flood: ["flood", "flooding", "waterlogged", "heavy rain trapped"],
  earthquake: ["earthquake", "tremor", "building shaking"],
  medical: ["heart attack", "not breathing", "unconscious", "snake bite", "accident injury", "medical emergency"],
  road_accident: ["road accident", "car crash", "hit by vehicle"],
};

const EMERGENCY_CATEGORY_TO_OFFICE_CATEGORY = {
  gas: "gas",
  fire: "fire",
  flood: "police",
  earthquake: "hospital",
  medical: "hospital",
  road_accident: "hospital",
};

const EMERGENCY_CATEGORY_TO_NUMBER = {
  gas: "1906",
  fire: "101",
  flood: "1070",
  earthquake: "112",
  medical: "108",
  road_accident: "108",
};

const FRAUD_KEYWORDS = [
  "guaranteed return", "guaranteed returns", "monthly return", "double your money",
  "otp", "share your pin", "loan app link", "instant loan app", "recruit investors",
  "sure profit", "risk free investment",
];

// Maps keywords in a query to a relevant office category, so "nearest office"
// suggestions are actually about what was asked - not just whatever happens
// to be geographically closest regardless of relevance.
const QUERY_KEYWORD_TO_OFFICE_CATEGORY = [
  { keywords: ["driving licence", "driving license", "rto", "vehicle rc", "learner's licence", "learners licence"], category: "rto" },
  { keywords: ["hospital", "medical emergency", "ambulance", "injury", "injured"], category: "hospital" },
  { keywords: ["police", "theft", "robbery", "complaint against"], category: "police" },
  { keywords: ["fire station", "on fire", "burning building"], category: "fire" },
  { keywords: ["gas leak", "lpg", "gas agency"], category: "gas" },
  { keywords: ["electricity", "power cut", "eb office"], category: "electricity" },
  { keywords: ["collector", "collectorate", "revenue office"], category: "collector" },
  { keywords: ["aadhaar"], category: "aadhaar" },
  { keywords: ["passport"], category: "passport" },
  { keywords: ["atm"], category: "atm" },
  { keywords: ["bank branch", "nearest bank", "bank near"], category: "bank_branch" },
  { keywords: ["veterinary", "animal rescue", "injured animal"], category: "veterinary" },
];

function detectQueryOfficeCategory(query) {
  const q = query.toLowerCase();
  for (const { keywords, category } of QUERY_KEYWORD_TO_OFFICE_CATEGORY) {
    if (keywords.some((k) => q.includes(k))) return category;
  }
  return null;
}

function detectEmergency(query) {
  const q = query.toLowerCase();
  for (const [category, phrases] of Object.entries(EMERGENCY_KEYWORDS)) {
    if (phrases.some((p) => q.includes(p))) return category;
  }
  return null;
}

function detectFraudSignal(query) {
  const q = query.toLowerCase();
  return FRAUD_KEYWORDS.some((p) => q.includes(p));
}

const ASSISTANTS = {
  govt_emergency: {
    id: "govt_emergency",
    label: "Government & Emergency Services",
    systemPrompt: `You are the Government Emergency & Citizen Services Assistant for India.
You help citizens with emergency guidance, government department procedures, document
applications, and public welfare schemes. Be calm, direct, and precise. Never invent a
procedure, fee, or phone number that is not in the provided context. If the context is
insufficient, say plainly that you don't have verified information on that yet and suggest
the right department to contact.`,
    docsDir: path.join(DOCS_ROOT, "govt_emergency"),
    officeCategoryDefault: null,
  },
  banking: {
    id: "banking",
    label: "Banking & Financial Services",
    systemPrompt: `You are the Banking & Financial Services Assistant for India, grounded in
RBI/SEBI/NPCI policy documents. Explain banking, loan, UPI/ATM dispute, and fraud-advisory
information precisely and never invent a compensation amount, timeline, or rule that is not
in the provided context. For anything that looks like a fraud or investment-scheme question,
never confirm something is "safe" — only surface documented red flags. If context is
insufficient, say so plainly rather than guessing.`,
    docsDir: path.join(DOCS_ROOT, "banking"),
    officeCategoryDefault: "bank_branch",
  },
};

// Build retrieval indexes once at startup (cheap - this is a small local doc set).
const indexes = {};
for (const [id, cfg] of Object.entries(ASSISTANTS)) {
  indexes[id] = new RetrievalIndex(id, cfg.docsDir);
}

function getIndex(assistantId) {
  return indexes[assistantId];
}

module.exports = {
  ASSISTANTS,
  CONFIDENCE_THRESHOLD,
  getIndex,
  detectEmergency,
  detectFraudSignal,
  detectQueryOfficeCategory,
  EMERGENCY_CATEGORY_TO_OFFICE_CATEGORY,
  EMERGENCY_CATEGORY_TO_NUMBER,
};
