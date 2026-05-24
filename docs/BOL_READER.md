# HaulSync TMS Dispatch — BOL AI Reader

**File**: `backend/src/engines/bolReader.js`
**Supporting**: `backend/src/engines/correctionStore.js`

---

## What it does

Accepts a file path (image or PDF), calls a vision-capable LLM, and returns structured freight data. Eliminates 3–5 minutes of manual BOL entry per document. Average extraction time: ~30 seconds. Average confidence on clear documents: ~91%.

---

## Supported input formats

JPEG, PNG, WebP, TIFF, PDF — all accepted by the upload route (max 10 MB). PDF extraction works best when the PDF contains rasterised page images rather than text layers.

---

## Extracted fields

24 fields returned as JSON. Unknown or low-confidence fields are `null`.

| Field | Type | Notes |
|-------|------|-------|
| `bolNumber` | string | BOL/shipment number |
| `proNumber` | string | Carrier PRO number |
| `shipperName/Address/City/State/Zip/Phone` | string | 6 shipper fields |
| `consigneeName/Address/City/State/Zip/Phone` | string | 6 consignee fields |
| `pickupDate` / `deliveryDate` | string | ISO 8601 |
| `commodity` | string | Cargo description |
| `weightLbs` | number | Always pounds — model converts from kg |
| `pieces` / `pallets` | number | Counts |
| `dims` | string | LxWxH in inches |
| `hazmat` | boolean | True if any hazmat indicator found |
| `specialInstructions` | string | — |
| `rate` | number | Freight charge in USD |

`confidence` (0–1) returned by the model is stored in `document.aiConfidence` separately.

---

## How it works

### 1. Base64 encoding
File read synchronously from disk, encoded as base64, sent as inline `data:{mimeType};base64,...` URI. No publicly-accessible hosting required.

### 2. System prompt with few-shot corrections
Before each call, `correctionStore.getExamples()` returns the last 10 dispatcher corrections formatted as examples:
```
Correction (2024-05-08):
  weightLbs: AI="41000" → Correct="42000"
  consigneeCity: AI="Atlana" → Correct="Atlanta"
```
These are appended to the system prompt. The model learns from past mistakes without retraining.

### 3. API call
```javascript
client.chat.completions.create({
  model: process.env.AI_MODEL || 'gpt-4o',
  max_tokens: 1500,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: [
      { type: 'text',      text: 'Extract all BOL fields from this document:' },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,...`, detail: 'high' } },
    ]},
  ],
});
```
`detail: 'high'` requests full-resolution processing — important for small text like zip codes.

### 4. Async execution
Wrapped in `setImmediate` in the upload route — HTTP responds immediately, extraction runs after. Frontend polls `GET /api/documents/:id` every 2 s. `document:extracted` socket event fires on completion.

---

## Correction store

**File**: `backend/src/engines/correctionStore.js`
**Persisted to**: `uploads/corrections.json` (mounted as Docker volume)

On dispatcher review (`POST /api/documents/:id/review`), `recordCorrection()` diffs the AI output against the corrected values field by field, stores only changed fields, and trims the store to the last 50 entries.

`getExamples()` returns the last 10 formatted for the system prompt.

**Format**:
```json
[{
  "documentId": "uuid",
  "at": "2024-05-09T10:14:00.000Z",
  "corrections": {
    "weightLbs": { "ai": "41000", "corrected": "42000" }
  }
}]
```

---

## AI provider configuration

Uses the `openai` npm package. Works with any OpenAI-compatible endpoint via `AI_BASE_URL`.

| Provider | AI_BASE_URL |
|----------|-------------|
| OpenAI (default) | `https://api.openai.com/v1` |
| Azure OpenAI | `https://{resource}.openai.azure.com/openai/deployments/{deployment}` |
| Ollama (local) | `http://localhost:11434/v1` |

For data residency in EU/GCC: use an Azure OpenAI endpoint in the appropriate region.

---

## Typical confidence by document quality

| Quality | Confidence |
|---------|-----------|
| Clear digital PDF | 0.92–0.98 |
| Good scan | 0.82–0.92 |
| Low-res / fax | 0.60–0.82 |
| Handwritten | 0.40–0.70 |

---

## Error handling

| Scenario | Result |
|----------|--------|
| Invalid API key / rate limit | `aiStatus = REJECTED`, error logged |
| JSON parse failure | `{ confidence: 0, parseError: true }`, REJECTED |
| File > 10 MB | Rejected by Multer, 400 response |
| Unsupported mime type | Rejected by Multer, 400 response |
