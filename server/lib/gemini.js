const { GoogleGenerativeAI } = require("@google/generative-ai");

let client = null;
function getClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client;
}

/**
 * Calls Gemini (free-tier "gemini-1.5-flash" model) to compose the final
 * answer, grounded strictly in the retrieved context chunks. If no API key
 * is configured, falls back to returning the top retrieved chunk directly
 * so the app still works end-to-end for a demo without any key.
 */
async function generateGroundedAnswer({ systemPrompt, userQuery, contextChunks }) {
  const contextText = contextChunks
    .map((c, i) => `[Source ${i + 1}: ${c.source}]\n${c.text}`)
    .join("\n\n");

  const genAI = getClient();

  if (!genAI) {
    // Offline fallback: no key configured, answer directly from best chunk.
    if (contextChunks.length === 0) {
      return "I don't have verified information on this in my documents yet. (No GEMINI_API_KEY configured, so this is a fallback answer — set one in .env for full LLM responses.)";
    }
    return (
      `Based on the matched document (${contextChunks[0].source}):\n\n${contextChunks[0].text}\n\n` +
      `[Note: GEMINI_API_KEY is not set, so this is a direct retrieval fallback rather than an LLM-composed answer.]`
    );
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `${systemPrompt}

CONTEXT DOCUMENTS (this is the ONLY information you may use to answer; do not invent facts not present here):
${contextText || "(no matching documents found)"}

USER QUESTION: ${userQuery}

Answer using only the context above. If the context does not contain enough information to answer confidently, say so plainly instead of guessing.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

module.exports = { generateGroundedAnswer, getClient };
