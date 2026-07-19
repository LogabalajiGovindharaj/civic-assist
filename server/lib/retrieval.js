// Lightweight local RAG retrieval: chunk documents, score with TF-IDF cosine
// similarity against the query. No external embedding API calls needed, so
// retrieval works even with no internet connection or API key.

const fs = require("fs");
const path = require("path");

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "to", "of", "in", "on", "for", "and", "or", "but", "if", "then", "than",
  "as", "at", "by", "with", "from", "this", "that", "these", "those", "it",
  "its", "i", "you", "he", "she", "we", "they", "my", "your", "do", "does",
  "did", "not", "no", "so", "what", "how", "why", "when", "will", "can",
  "should", "would", "could", "there", "their",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s₹]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function chunkDocument(rawText, sourceFile) {
  // Split on blank lines into paragraph-sized chunks; keeps each chunk
  // small enough to be a focused, citable unit of retrieval.
  const paragraphs = rawText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30);

  return paragraphs.map((text, i) => ({
    id: `${path.basename(sourceFile)}#${i}`,
    source: path.basename(sourceFile),
    text,
  }));
}

class RetrievalIndex {
  constructor(assistantId, docsDir) {
    this.assistantId = assistantId;
    this.chunks = [];
    this.df = new Map(); // document frequency per term
    this._load(docsDir);
    this._buildIndex();
  }

  _load(docsDir) {
    if (!fs.existsSync(docsDir)) return;
    const files = fs.readdirSync(docsDir).filter((f) => f.endsWith(".txt"));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(docsDir, file), "utf-8");
      this.chunks.push(...chunkDocument(raw, file));
    }
  }

  _buildIndex() {
    for (const chunk of this.chunks) {
      chunk.tokens = tokenize(chunk.text);
      chunk.tf = new Map();
      for (const tok of chunk.tokens) {
        chunk.tf.set(tok, (chunk.tf.get(tok) || 0) + 1);
      }
      for (const tok of new Set(chunk.tokens)) {
        this.df.set(tok, (this.df.get(tok) || 0) + 1);
      }
    }
    const N = this.chunks.length || 1;
    this.idf = new Map();
    for (const [tok, df] of this.df.entries()) {
      this.idf.set(tok, Math.log((1 + N) / (1 + df)) + 1);
    }
    // Precompute normalized tf-idf vectors for each chunk
    for (const chunk of this.chunks) {
      const vec = new Map();
      for (const [tok, tf] of chunk.tf.entries()) {
        vec.set(tok, tf * (this.idf.get(tok) || 0));
      }
      const norm = Math.sqrt([...vec.values()].reduce((s, v) => s + v * v, 0)) || 1;
      chunk.vector = vec;
      chunk.norm = norm;
    }
  }

  /**
   * Returns top-k chunks with a cosine-similarity score in [0, 1],
   * sorted descending by score.
   */
  search(query, k = 3) {
    const qTokens = tokenize(query);
    const qtf = new Map();
    for (const tok of qTokens) qtf.set(tok, (qtf.get(tok) || 0) + 1);
    const qvec = new Map();
    for (const [tok, tf] of qtf.entries()) {
      qvec.set(tok, tf * (this.idf.get(tok) || 0));
    }
    const qnorm = Math.sqrt([...qvec.values()].reduce((s, v) => s + v * v, 0)) || 1;

    const scored = this.chunks.map((chunk) => {
      let dot = 0;
      let overlap = 0;
      for (const [tok, w] of qvec.entries()) {
        if (chunk.vector.has(tok)) {
          dot += w * chunk.vector.get(tok);
          overlap += 1;
        }
      }
      const score = dot / (qnorm * chunk.norm || 1);
      return { source: chunk.source, text: chunk.text, score, overlap };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

module.exports = { RetrievalIndex, tokenize };
