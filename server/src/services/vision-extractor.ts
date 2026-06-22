import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { getVisionOllamaClient } from "./ollama-client.js";
import {
  buildVisionClassificationPrompt,
  buildVisionBelegarttDetectionPrompt,
  buildVisionAccountingFieldExtractionPrompt,
  getSystemPrompt,
  getAccountingSystemPrompt,
} from "./prompt-templates.js";
import type { ClassificationResult } from "./llm-service.js";
import type { BelegarttDetectionResult, Belegart } from "./belegart-detector.js";
import type { AccountingFields } from "./accounting-field-extractor.js";
import type { DocumentType } from "../types/models.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Image preparation — converts document files to a base64 PNG for vision LLM
// ---------------------------------------------------------------------------

/**
 * Reads an image file (PNG/JPEG/WebP/TIFF), normalises it with Sharp,
 * and returns base64-encoded PNG data (no data-URI prefix).
 * The output is resized to max 1800×2400 px to keep the request payload small.
 */
async function imageFileToBase64(imagePath: string): Promise<string> {
  const pngBuffer = await sharp(imagePath)
    .resize(1800, 2400, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 6 })
    .toBuffer();
  return pngBuffer.toString("base64");
}

/**
 * Renders the first page of a PDF to a PNG using pdf2pic and returns base64.
 * Falls back gracefully if poppler (required by pdf2pic) is not installed.
 */
async function pdfFirstPageToBase64(pdfPath: string): Promise<string> {
  // Dynamic import — pdf2pic is CommonJS
  const { fromPath } = await import("pdf2pic");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "docreader-vision-"));
  try {
    const converter = fromPath(pdfPath, {
      density: 200,           // DPI — 200 gives a good quality/size trade-off
      savePath: tmpDir,
      saveFilename: "page",
      format: "png",
      width: 1800,
      height: 2400,
    });

    // Convert page 1 only
    const result = await converter(1, { responseType: "image" });
    if (!result.path) {
      throw new Error("pdf2pic did not produce an output file");
    }

    const base64 = fs.readFileSync(result.path).toString("base64");
    return base64;
  } finally {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Converts any supported document file (image or PDF) to a base64 PNG
 * suitable for the Ollama vision API.
 */
export async function documentToBase64(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    return pdfFirstPageToBase64(filePath);
  }

  // For all other formats, use Sharp (supports PNG, JPEG, WebP, TIFF, GIF)
  return imageFileToBase64(filePath);
}

// ---------------------------------------------------------------------------
// JSON parsing helper (same pattern as other services)
// ---------------------------------------------------------------------------

function parseJsonResponse<T>(response: string): T {
  let cleaned = response.trim();
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) cleaned = jsonBlockMatch[1].trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];
  return JSON.parse(cleaned) as T;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classifies a document by sending its image directly to the vision LLM.
 */
export async function classifyDocumentWithVision(
  filePath: string,
  types: DocumentType[]
): Promise<ClassificationResult> {
  const client = getVisionOllamaClient();
  const imageBase64 = await documentToBase64(filePath);
  const prompt = buildVisionClassificationPrompt(
    types.map((t) => ({ name: t.name, description: t.description ?? "" }))
  );

  const response = await client.generateWithImage(prompt, imageBase64, {
    system: getSystemPrompt(),
    temperature: 0.05,
  });

  const result = parseJsonResponse<ClassificationResult>(response);
  logger.info(
    { type: result.type, confidence: result.confidence, path: filePath },
    "Vision classification completed"
  );
  return result;
}

// ---------------------------------------------------------------------------
// Belegart detection (accounting document type)
// ---------------------------------------------------------------------------

const VALID_BELEGARTEN = new Set<Belegart>([
  "eingangsrechnung", "ausgangsrechnung", "quittung", "kontoauszug",
  "mahnung", "lohnabrechnung", "vertrag", "datev_export", "unbekannt",
]);

/**
 * Detects the German accounting Belegart by passing the document image
 * directly to the vision LLM.
 */
export async function detectBelegarttWithVision(
  filePath: string
): Promise<BelegarttDetectionResult> {
  const client = getVisionOllamaClient();
  const imageBase64 = await documentToBase64(filePath);
  const prompt = buildVisionBelegarttDetectionPrompt();

  const response = await client.generateWithImage(prompt, imageBase64, {
    system: getAccountingSystemPrompt(),
    temperature: 0.05,
  });

  const parsed = parseJsonResponse<{ belegart: string; confidence: number }>(response);

  const belegart = VALID_BELEGARTEN.has(parsed.belegart as Belegart)
    ? (parsed.belegart as Belegart)
    : "unbekannt";

  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;

  logger.info(
    { belegart, confidence, path: filePath },
    "Vision Belegart detection completed"
  );
  return { belegart, confidence };
}

// ---------------------------------------------------------------------------
// Accounting field extraction
// ---------------------------------------------------------------------------

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(",", "."));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

const VALID_ZAHLUNGSSTATUS = new Set(["offen", "bezahlt", "teilweise_bezahlt"]);

/**
 * Extracts structured §14 UStG accounting fields by passing the document image
 * directly to the vision LLM.
 */
export async function extractAccountingFieldsWithVision(
  filePath: string
): Promise<AccountingFields> {
  const client = getVisionOllamaClient();
  const imageBase64 = await documentToBase64(filePath);
  const prompt = buildVisionAccountingFieldExtractionPrompt();

  const empty: AccountingFields = {
    aussteller: null, empfaenger: null, rechnungsnummer: null,
    rechnungsdatum: null, leistungsdatum: null, faelligkeitsdatum: null,
    netto_betrag: null, ust_satz: null, ust_betrag: null, brutto_betrag: null,
    iban: null, verwendungszweck: null, zahlungsstatus: null, offene_fragen: [],
  };

  const response = await client.generateWithImage(prompt, imageBase64, {
    system: getAccountingSystemPrompt(),
    temperature: 0.1,
    maxTokens: 1024,
  });

  const raw = parseJsonResponse<Record<string, unknown>>(response);

  const zahlungsstatusRaw = toStr(raw.zahlungsstatus);
  const zahlungsstatus =
    zahlungsstatusRaw && VALID_ZAHLUNGSSTATUS.has(zahlungsstatusRaw)
      ? (zahlungsstatusRaw as AccountingFields["zahlungsstatus"])
      : null;

  const offeneFragenRaw = raw.offene_fragen;
  const offene_fragen = Array.isArray(offeneFragenRaw)
    ? offeneFragenRaw.map((q) => String(q).trim()).filter((q) => q.length > 0)
    : [];

  const fields: AccountingFields = {
    aussteller: toStr(raw.aussteller),
    empfaenger: toStr(raw.empfaenger),
    rechnungsnummer: toStr(raw.rechnungsnummer),
    rechnungsdatum: toStr(raw.rechnungsdatum),
    leistungsdatum: toStr(raw.leistungsdatum),
    faelligkeitsdatum: toStr(raw.faelligkeitsdatum),
    netto_betrag: toNumber(raw.netto_betrag),
    ust_satz: toNumber(raw.ust_satz),
    ust_betrag: toNumber(raw.ust_betrag),
    brutto_betrag: toNumber(raw.brutto_betrag),
    iban: toStr(raw.iban),
    verwendungszweck: toStr(raw.verwendungszweck),
    zahlungsstatus,
    offene_fragen,
  };

  logger.info(
    { rechnungsnummer: fields.rechnungsnummer, brutto_betrag: fields.brutto_betrag, path: filePath },
    "Vision accounting field extraction completed"
  );

  return { ...empty, ...fields };
}
