/**
 * correctionStore.js
 *
 * Persists dispatcher corrections to a JSON file so the bolReader can
 * include them as few-shot examples in future prompts. This improves
 * extraction accuracy per document type without any model retraining.
 */

const fs   = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../../uploads/corrections.json');

function load() {
  if (!fs.existsSync(STORE_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); }
  catch { return []; }
}

function persist(data) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

/**
 * Save a correction record.
 * @param {string} documentId
 * @param {Object} aiOutput       - what the AI returned
 * @param {Object} correctedOutput - what the dispatcher confirmed/corrected
 */
async function save(documentId, aiOutput, correctedOutput) {
  const store = load();

  // Find fields that were actually corrected
  const corrections = {};
  for (const [key, correctedVal] of Object.entries(correctedOutput)) {
    const aiVal = aiOutput[key];
    if (String(aiVal) !== String(correctedVal)) {
      corrections[key] = { ai: aiVal, corrected: correctedVal };
    }
  }

  if (!Object.keys(corrections).length) return; // nothing changed

  store.push({ documentId, corrections, at: new Date().toISOString() });

  // Keep only last 50 corrections to avoid prompt bloat
  const trimmed = store.slice(-50);
  persist(trimmed);
}

/**
 * Get formatted correction examples for the system prompt.
 * Returns a compact string representation.
 */
async function getExamples() {
  const store = load();
  if (!store.length) return [];

  return store.slice(-10).map((entry) => {
    const lines = Object.entries(entry.corrections)
      .map(([field, { ai, corrected }]) => `  ${field}: AI="${ai}" → Correct="${corrected}"`)
      .join('\n');
    return `Correction (${entry.at.slice(0, 10)}):\n${lines}`;
  });
}

module.exports = { save, getExamples };
