/**
 * bolReader.js — AI-powered BOL document extraction engine.
 *
 * Accepts a file path (image or PDF rendered to image), calls the
 * configured OpenAI-compatible vision model, and returns structured
 * load fields. Every dispatcher correction is stored in correctionStore
 * to improve future prompts per document type.
 */

const fs              = require('fs');
const path            = require('path');
const { OpenAI }      = require('openai');
const correctionStore = require('./correctionStore');

const client = new OpenAI({
  apiKey:  process.env.AI_API_KEY,
  baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
});

const MODEL = process.env.AI_MODEL || 'gpt-4o';

const BASE_SYSTEM_PROMPT = `You are an expert freight document reader specialised in Bills of Lading (BOL), rate confirmations, and shipping orders.

Extract the following fields from the document image and return ONLY a valid JSON object with no markdown, no explanation, no preamble.

Fields to extract:
{
  "bolNumber":          string | null,
  "proNumber":          string | null,
  "shipperName":        string | null,
  "shipperAddress":     string | null,
  "shipperCity":        string | null,
  "shipperState":       string | null,
  "shipperZip":         string | null,
  "shipperPhone":       string | null,
  "consigneeName":      string | null,
  "consigneeAddress":   string | null,
  "consigneeCity":      string | null,
  "consigneeState":     string | null,
  "consigneeZip":       string | null,
  "consigneePhone":     string | null,
  "pickupDate":         string | null,  // ISO 8601
  "deliveryDate":       string | null,  // ISO 8601
  "commodity":          string | null,
  "weightLbs":          number | null,
  "pieces":             number | null,
  "pallets":            number | null,
  "dims":               string | null,  // LxWxH inches
  "hazmat":             boolean,
  "specialInstructions": string | null,
  "rate":               number | null,
  "confidence":         number          // 0.0–1.0 overall confidence
}

Rules:
- Return null for any field you cannot find or are not confident about.
- Dates must be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ).
- Weight must be in pounds. Convert if in other units.
- confidence is your overall extraction confidence across all fields.`;

/**
 * Extract BOL fields from a document file.
 * @param {string} filePath   - Absolute path to image file
 * @param {string} documentId - DB document ID (used for correction lookup)
 * @param {string} mimeType   - e.g. 'image/jpeg'
 * @returns {Promise<{ extracted: Object, confidence: number, rawResponse: string }>}
 */
async function extractBOL(filePath, documentId, mimeType = 'image/jpeg') {
  const imageData   = fs.readFileSync(filePath);
  const base64Image = imageData.toString('base64');

  // Pull any stored corrections for this document type to append as examples
  const corrections = await correctionStore.getExamples();
  const systemPrompt = corrections.length
    ? `${BASE_SYSTEM_PROMPT}\n\n# Dispatcher corrections from past documents (learn from these):\n${corrections}`
    : BASE_SYSTEM_PROMPT;

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all BOL fields from this document:' },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' } },
        ],
      },
    ],
  });

  const rawText = response.choices[0]?.message?.content || '{}';

  let extracted = {};
  try {
    const clean = rawText.replace(/```json|```/g, '').trim();
    extracted   = JSON.parse(clean);
  } catch {
    extracted = { confidence: 0, parseError: true };
  }

  const confidence = extracted.confidence ?? 0;
  delete extracted.confidence;

  return { extracted, confidence, rawResponse: rawText };
}

/**
 * Record a dispatcher correction for future prompt improvement.
 * Called after dispatcher reviews and saves edits to an extracted BOL.
 */
async function recordCorrection(documentId, aiExtracted, dispatcherValues) {
  await correctionStore.save(documentId, aiExtracted, dispatcherValues);
}

module.exports = { extractBOL, recordCorrection };
