import { Router } from "express";
import { getAllTags, createTag } from "../services/tag-service.js";

export const tagsRouter = Router();

// GET /api/tags — List all tags
tagsRouter.get("/", (_req, res) => {
  res.json(getAllTags());
});

// POST /api/tags — Create a new tag
tagsRouter.post("/", (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.length > 64) {
    res.status(400).json({ error: "Invalid tag name" });
    return;
  }
  try {
    const tag = createTag(name.trim());
    res.status(201).json(tag);
  } catch (err: any) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      res.status(409).json({ error: "Tag already exists" });
    } else {
      res.status(500).json({ error: "Failed to create tag" });
    }
  }
});
