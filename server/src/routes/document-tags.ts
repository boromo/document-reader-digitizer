import { Router } from "express";
import {
  addTagToDocument,
  removeTagFromDocument,
  setTagsForDocument,
} from "../services/tag-service.js";

export const documentTagsRouter = Router();

// POST /api/documents/:id/tags — Set tags for a document (replace all)
documentTagsRouter.post("/:id/tags", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { tagIds } = req.body as { tagIds?: number[] };
  if (!Array.isArray(tagIds)) {
    res.status(400).json({ error: "tagIds must be an array of tag IDs" });
    return;
  }
  setTagsForDocument(id, tagIds);
  res.status(204).send();
});

// POST /api/documents/:id/tags/:tagId — Add a tag to a document
documentTagsRouter.post("/:id/tags/:tagId", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tagId = parseInt(req.params.tagId, 10);
  addTagToDocument(id, tagId);
  res.status(204).send();
});

// DELETE /api/documents/:id/tags/:tagId — Remove a tag from a document
documentTagsRouter.delete("/:id/tags/:tagId", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tagId = parseInt(req.params.tagId, 10);
  removeTagFromDocument(id, tagId);
  res.status(204).send();
});
