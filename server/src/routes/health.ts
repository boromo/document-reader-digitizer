import { Router } from "express";
import { getDb } from "../db/database.js";
import { config } from "../config.js";
import { isTesseractAvailable } from "../services/ocr-service.js";
import { getOllamaClient, getVisionOllamaClient } from "../services/ollama-client.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // Database check
  try {
    const row = getDb().prepare("SELECT COUNT(*) as count FROM documents").get() as { count: number };
    checks.database = { status: "ok", detail: `${row.count} documents` };
  } catch (err) {
    checks.database = { status: "error", detail: String(err) };
  }

  // Tesseract check
  const tesseractOk = await isTesseractAvailable();
  checks.tesseract = tesseractOk
    ? { status: "ok" }
    : { status: "error", detail: "Tesseract binary not found. Install via: brew install tesseract" };

  // Ollama text LLM check
  const ollamaClient = getOllamaClient();
  const ollamaUp = await ollamaClient.isAvailable();
  if (ollamaUp) {
    const modelReady = await ollamaClient.isModelAvailable();
    checks.ollama = modelReady
      ? { status: "ok", detail: `${config.ollamaUrl} (model: ${config.ollamaModel})` }
      : { status: "warning", detail: `Ollama running but model "${config.ollamaModel}" not found. Run: ollama pull ${config.ollamaModel}` };
  } else {
    checks.ollama = {
      status: "error",
      detail: `Ollama not reachable at ${config.ollamaUrl}. Start with: ollama serve`,
    };
  }

  // Ollama vision LLM check
  const visionClient = getVisionOllamaClient();
  try {
    const visionModelReady = await visionClient.isModelAvailable();
    checks.ollamaVision = visionModelReady
      ? { status: "ok", detail: `model: ${config.ollamaVisionModel}` }
      : {
          status: "warning",
          detail: `Vision model "${config.ollamaVisionModel}" not pulled. Run: ollama pull ${config.ollamaVisionModel}. Field extraction will fall back to text LLM.`,
        };
  } catch {
    checks.ollamaVision = {
      status: "warning",
      detail: `Could not check vision model status. Field extraction will fall back to text LLM.`,
    };
  }

  const allOk = Object.values(checks).every((c) => c.status !== "error");

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
});
