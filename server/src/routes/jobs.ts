import { Router } from "express";
import { getDb } from "../db/database.js";
import { getQueueStats } from "../services/processing-pipeline.js";
import type { ProcessingJob } from "../types/models.js";

export const jobsRouter = Router();

// GET /api/jobs/stats — Queue statistics
jobsRouter.get("/stats", (_req, res) => {
  const stats = getQueueStats();
  res.json(stats);
});

// GET /api/jobs/:documentId — Get processing job for a document
jobsRouter.get("/:documentId", (req, res) => {
  const documentId = parseInt(req.params.documentId, 10);
  if (isNaN(documentId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }

  const db = getDb();
  const job = db
    .prepare("SELECT * FROM processing_jobs WHERE document_id = ?")
    .get(documentId) as ProcessingJob | undefined;

  if (!job) {
    res.status(404).json({ error: "No processing job found for this document" });
    return;
  }

  res.json(job);
});
