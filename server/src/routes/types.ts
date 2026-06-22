import { Router } from "express";
import { getDb } from "../db/database.js";
import type { DocumentType } from "../types/models.js";

export const typesRouter = Router();

// GET /api/types — List all document types
typesRouter.get("/", (_req, res) => {
  const db = getDb();
  const types = db.prepare("SELECT * FROM document_types ORDER BY name").all() as DocumentType[];
  res.json(types);
});
