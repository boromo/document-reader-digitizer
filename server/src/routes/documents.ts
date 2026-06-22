import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import {
  validateFile,
  storeFile,
  deleteStoredFile,
  getOriginalFilePath,
} from "../services/upload-service.js";
import {
  createDocument,
  getDocumentById,
  getDocumentWithDetails,
  listDocuments,
  deleteDocument,
  createProcessingJob,
  updateDocumentStatus,
} from "../services/document-service.js";
import { enqueueDocument } from "../services/processing-pipeline.js";
import { getDb } from "../db/database.js";
import { logger } from "../logger.js";

export const documentsRouter = Router();

// Multer configured for memory storage (buffer) so we can validate before writing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxSizeBytes },
});

// POST /api/documents/upload — Upload one or more documents
documentsRouter.post(
  "/upload",
  upload.array("files", 20),
  (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files provided" });
      return;
    }

    const results: Array<{
      id: number;
      filename: string;
      status: string;
      jobId: number;
    }> = [];
    const errors: Array<{ filename: string; reason: string }> = [];

    for (const file of files) {
      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(validationError);
        continue;
      }

      try {
        // Store file to filesystem
        const stored = storeFile(file);

        // Create document record in database
        const doc = createDocument({
          originalFilename: stored.originalFilename,
          storedPath: stored.storedPath,
          mimeType: stored.mimeType,
          fileSizeBytes: stored.fileSizeBytes,
          uploadedBy: null, // TODO: wire up auth in Phase 7
        });

        // Create processing job
        const job = createProcessingJob(doc.id);

        // Enqueue for async processing (OCR → LLM pipeline)
        enqueueDocument(doc.id, job.id);

        results.push({
          id: doc.id,
          filename: stored.originalFilename,
          status: doc.status,
          jobId: job.id,
        });
      } catch (err) {
        logger.error(err, `Failed to process upload: ${file.originalname}`);
        errors.push({
          filename: file.originalname,
          reason: "Internal error during upload processing",
        });
      }
    }

    const statusCode =
      results.length > 0 && errors.length > 0
        ? 207 // Multi-status: partial success
        : results.length > 0
          ? 202 // Accepted for processing
          : 400; // All failed

    res.status(statusCode).json({
      uploaded: results,
      errors,
      total: files.length,
      successful: results.length,
      failed: errors.length,
    });
  }
);

// GET /api/documents — List documents with filtering/pagination/sorting
documentsRouter.get("/", (req, res) => {
  const { status, page, limit, search, tags, type, from, to, minSize, maxSize, sort, dir } = req.query;

  // Multi-value tag IDs (AND logic)
  let tagIds: number[] | undefined = undefined;
  if (typeof tags === "string" && tags.trim()) {
    tagIds = tags.split(",").map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
    if (tagIds.length === 0) tagIds = undefined;
  }

  // Multi-value statuses (OR logic)
  let statuses: string[] | undefined = undefined;
  if (typeof status === "string" && status.trim()) {
    statuses = status.split(",").filter(Boolean);
  }

  // Multi-value document types (OR logic)
  let types: string[] | undefined = undefined;
  if (typeof type === "string" && type.trim()) {
    types = type.split(",").filter(Boolean);
  }

  // Sort validation
  const allowedSortFields = ["upload_date", "original_filename", "file_size_bytes", "status"] as const;
  type SortField = typeof allowedSortFields[number];
  const sortField: SortField | undefined = typeof sort === "string" && allowedSortFields.includes(sort as SortField)
    ? (sort as SortField)
    : undefined;
  const sortDir: "asc" | "desc" | undefined = dir === "asc" || dir === "desc" ? dir : undefined;

  const result = listDocuments({
    statuses,
    page: typeof page === "string" ? parseInt(page, 10) : undefined,
    limit: typeof limit === "string" ? parseInt(limit, 10) : undefined,
    search: typeof search === "string" ? search : undefined,
    tagIds,
    types,
    from: typeof from === "string" ? from : undefined,
    to: typeof to === "string" ? to : undefined,
    minSize: typeof minSize === "string" ? parseInt(minSize, 10) : undefined,
    maxSize: typeof maxSize === "string" ? parseInt(maxSize, 10) : undefined,
    sort: sortField,
    dir: sortDir,
  });

  res.json(result);
});

// GET /api/documents/:id — Get document with all details
documentsRouter.get("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const doc = getDocumentWithDetails(id);
  console.log(doc);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(doc);
});

// GET /api/documents/:id/original — Serve the original uploaded file
documentsRouter.get("/:id/original", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const doc = getDocumentById(id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const filePath = getOriginalFilePath(doc.stored_path);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Original file not found on disk" });
    return;
  }

  res.setHeader("Content-Type", doc.mime_type);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${doc.original_filename}"`
  );
  res.sendFile(filePath);
});

// GET /api/documents/:id/thumbnail — Serve the thumbnail
documentsRouter.get("/:id/thumbnail", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const doc = getDocumentById(id);
  if (!doc || !doc.thumbnail_path) {
    res.status(404).json({ error: "Thumbnail not found" });
    return;
  }

  const thumbPath = path.resolve(process.cwd(), "storage", doc.thumbnail_path);
  if (!fs.existsSync(thumbPath)) {
    res.status(404).json({ error: "Thumbnail file not found on disk" });
    return;
  }

  res.setHeader("Content-Type", "image/webp");
  res.sendFile(thumbPath);
});

// DELETE /api/documents/:id — Delete document and its file
documentsRouter.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const doc = getDocumentById(id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  // Delete file from filesystem
  deleteStoredFile(doc.stored_path);
  if (doc.thumbnail_path) {
    deleteStoredFile(doc.thumbnail_path);
  }

  // Delete from database (cascades to related tables)
  deleteDocument(id);

  res.status(204).send();
});

// PATCH /api/documents/:id/confirm — Confirm AI classification + fields
documentsRouter.patch("/:id/confirm", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const doc = getDocumentById(id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Confirm classification
  db.prepare(
    `UPDATE classifications
     SET confirmed_type = COALESCE(confirmed_type, ai_suggested_type),
         confirmed_at = ?
     WHERE document_id = ?`
  ).run(now, id);

  // Confirm extracted fields
  db.prepare(
    `UPDATE extracted_fields
     SET confirmed_value = COALESCE(confirmed_value, ai_suggested_value)
     WHERE document_id = ?`
  ).run(id);

  // Update document status
  updateDocumentStatus(id, "confirmed");

  res.json({ message: "Document confirmed", id });
});

// PATCH /api/documents/:id/classify — Override classification
documentsRouter.patch("/:id/classify", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const { type } = req.body as { type?: string };
  if (!type || typeof type !== "string") {
    res.status(400).json({ error: "Missing 'type' in request body" });
    return;
  }

  const doc = getDocumentById(id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE classifications
     SET confirmed_type = ?, confirmed_at = ?
     WHERE document_id = ?`
  ).run(type, now, id);

  res.json({ message: "Classification updated", id, type });
});

// PATCH /api/documents/:id/fields — Edit extracted fields
documentsRouter.patch("/:id/fields", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const { fields } = req.body as { fields?: Array<{ id: number; confirmed_value: string }> };
  if (!fields || !Array.isArray(fields)) {
    res.status(400).json({ error: "Missing 'fields' array in request body" });
    return;
  }

  const doc = getDocumentById(id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const db = getDb();
  const stmt = db.prepare(
    "UPDATE extracted_fields SET confirmed_value = ? WHERE id = ? AND document_id = ?"
  );

  const updateMany = db.transaction(() => {
    for (const field of fields) {
      stmt.run(field.confirmed_value, field.id, id);
    }
  });
  updateMany();

  res.json({ message: "Fields updated", id, count: fields.length });
});
