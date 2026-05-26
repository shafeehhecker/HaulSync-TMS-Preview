const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const prisma  = require('../lib/prisma');
const { authenticate, authorize } = require('../middleware/auth');
const { extractBOL, recordCorrection } = require('../engines/bolReader');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/bols');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `bol-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits:    { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/tiff'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /api/documents/upload — upload BOL and trigger AI extraction
router.post('/upload', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'OPERATOR'),
  upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      // Create document record
      const doc = await prisma.document.create({
        data: {
          type:        req.body.type || 'BOL',
          originalName: req.file.originalname,
          filePath:    req.file.path,
          mimeType:    req.file.mimetype,
          sizeBytes:   req.file.size,
          aiStatus:    'PENDING',
          loadId:      req.body.loadId || null,
        },
      });

      // Run AI extraction asynchronously
      setImmediate(async () => {
        try {
          const { extracted, confidence, rawResponse } = await extractBOL(
            req.file.path, doc.id, req.file.mimetype
          );
          await prisma.document.update({
            where: { id: doc.id },
            data: {
              aiStatus:      'EXTRACTED',
              aiExtracted:   extracted,
              aiConfidence:  confidence,
              aiModel:       process.env.AI_MODEL || 'gpt-4o',
              aiRawResponse: { raw: rawResponse },
              extractedAt:   new Date(),
            },
          });
          // Emit to dispatcher for live preview
          req.app.get('io')?.emit('document:extracted', { documentId: doc.id, extracted, confidence });
        } catch (e) {
          console.error('BOL extraction failed:', e.message);
          await prisma.document.update({
            where: { id: doc.id },
            data: { aiStatus: 'REJECTED' },
          });
        }
      });

      res.status(201).json({ document: doc, message: 'File uploaded. AI extraction in progress.' });
    } catch (err) { next(err); }
  }
);

// GET /api/documents/:id — get document with extracted fields
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    res.json(doc);
  } catch (err) { next(err); }
});

// POST /api/documents/:id/review — dispatcher confirms/corrects extraction
router.post('/:id/review', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'OPERATOR'),
  async (req, res, next) => {
    try {
      const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
      if (!doc) return res.status(404).json({ message: 'Document not found' });

      const { correctedFields, loadId } = req.body;

      // Calculate what the dispatcher changed vs AI output
      const correctionDelta = {};
      if (doc.aiExtracted && correctedFields) {
        for (const [key, val] of Object.entries(correctedFields)) {
          if (String(doc.aiExtracted[key]) !== String(val)) {
            correctionDelta[key] = { ai: doc.aiExtracted[key], corrected: val };
          }
        }
      }

      // Store correction for future prompt improvement
      if (Object.keys(correctionDelta).length && doc.aiExtracted) {
        await recordCorrection(doc.id, doc.aiExtracted, correctedFields);
      }

      const updated = await prisma.document.update({
        where: { id: req.params.id },
        data: {
          aiStatus:       'REVIEWED',
          reviewedAt:     new Date(),
          reviewedById:   req.user.id,
          correctionDelta,
          ...(loadId && { loadId }),
        },
      });

      res.json(updated);
    } catch (err) { next(err); }
  }
);

module.exports = router;
