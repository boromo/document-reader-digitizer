import path from "node:path";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  dataDir: path.resolve(process.cwd(), "data"),
  dbPath: path.resolve(process.cwd(), "data", "app.db"),
  storageDir: path.resolve(process.cwd(), "storage"),
  originalsDir: path.resolve(process.cwd(), "storage", "originals"),
  thumbnailsDir: path.resolve(process.cwd(), "storage", "thumbnails"),
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
  uploadMaxSizeBytes: 50 * 1024 * 1024, // 50 MB
  ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "llama3.1",
  ollamaVisionModel: process.env.OLLAMA_VISION_MODEL || "qwen3-vl",
} as const;
