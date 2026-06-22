import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { v4 as uuidv4 } from "uuid";
import { preprocessImage } from "./image-preprocessor.js";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);

export interface OcrResult {
  text: string;
  confidence: number;
  pageCount: number;
}

interface TesseractTsvRow {
  level: number;
  conf: number;
  text: string;
}

async function runTesseract(
  imagePath: string,
  options: string[] = []
): Promise<{ text: string; confidence: number }> {
  const args = [
    imagePath,
    "stdout",
    "-l", "eng",
    "--oem", "3",
    "--psm", "3",
    ...options,
  ];

  const { stdout: text } = await execFileAsync("tesseract", args, {
    maxBuffer: 10 * 1024 * 1024,
  });

  // Run again with TSV output to get confidence scores
  const tsvArgs = [
    imagePath,
    "stdout",
    "-l", "eng",
    "--oem", "3",
    "--psm", "3",
    "tsv",
  ];

  const { stdout: tsvOutput } = await execFileAsync("tesseract", tsvArgs, {
    maxBuffer: 10 * 1024 * 1024,
  });

  const confidence = parseConfidence(tsvOutput);

  return { text: text.trim(), confidence };
}

function parseConfidence(tsvOutput: string): number {
  const lines = tsvOutput.split("\n").slice(1); // skip header
  const confidences: number[] = [];

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 12) continue;

    const conf = parseInt(parts[10], 10);
    const text = parts[11]?.trim();

    // Only count word-level entries with actual text
    if (conf >= 0 && text && text.length > 0) {
      confidences.push(conf);
    }
  }

  if (confidences.length === 0) return 0;
  return confidences.reduce((a, b) => a + b, 0) / confidences.length;
}

function createTempDir(): string {
  const tmpDir = path.join(os.tmpdir(), `ocr-${uuidv4()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanupTempDir(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err) {
    logger.warn({ tmpDir, err }, "Failed to cleanup temp directory");
  }
}

export async function extractTextFromImage(
  imagePath: string
): Promise<OcrResult> {
  const tmpDir = createTempDir();

  try {
    // Preprocess image for better OCR quality
    const processedPath = path.join(tmpDir, "processed.png");
    await preprocessImage(imagePath, processedPath);

    const { text, confidence } = await runTesseract(processedPath);

    logger.info(
      { imagePath, confidence: confidence.toFixed(1), textLength: text.length },
      "OCR completed"
    );

    return { text, confidence, pageCount: 1 };
  } finally {
    cleanupTempDir(tmpDir);
  }
}

export async function extractTextFromPdf(
  pdfPath: string
): Promise<OcrResult> {
  const tmpDir = createTempDir();

  try {
    // Tesseract cannot read PDF files directly — convert to images first
    return await extractPdfPages(pdfPath, tmpDir);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function extractPdfPages(
  pdfPath: string,
  tmpDir: string
): Promise<OcrResult> {
  // Use pdftoppm (poppler) to convert PDF pages to PNG images
  const prefix = path.join(tmpDir, "page");
  await execFileAsync("pdftoppm", ["-png", "-r", "300", pdfPath, prefix], {
    maxBuffer: 50 * 1024 * 1024,
  });

  // pdftoppm creates files like page-1.png, page-2.png, etc.
  const pageFiles = fs
    .readdirSync(tmpDir)
    .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
    .sort();

  const allTexts: string[] = [];
  const allConfidences: number[] = [];

  for (const pageFile of pageFiles) {
    const pagePath = path.join(tmpDir, pageFile);
    const processedPath = path.join(
      tmpDir,
      pageFile.replace(".png", "-processed.png")
    );
    await preprocessImage(pagePath, processedPath);

    const { text, confidence } = await runTesseract(processedPath);
    if (text.trim()) {
      allTexts.push(text);
      allConfidences.push(confidence);
    }
  }

  const combinedText = allTexts.join("\n\n--- Page Break ---\n\n");
  const avgConfidence =
    allConfidences.length > 0
      ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
      : 0;

  logger.info(
    { pdfPath, pages: pageFiles.length, confidence: avgConfidence.toFixed(1) },
    "PDF page-by-page OCR completed"
  );

  return {
    text: combinedText,
    confidence: avgConfidence,
    pageCount: pageFiles.length,
  };
}

export async function extractText(filePath: string, mimeType: string): Promise<OcrResult> {
  if (mimeType === "application/pdf") {
    return extractTextFromPdf(filePath);
  }
  return extractTextFromImage(filePath);
}

export async function isTesseractAvailable(): Promise<boolean> {
  try {
    await execFileAsync("tesseract", ["--version"]);
    return true;
  } catch {
    return false;
  }
}
