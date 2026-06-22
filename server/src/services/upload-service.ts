import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { logger } from "../logger.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/bmp",
  "image/webp",
  "application/pdf",
]);

const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/tiff", bytes: [0x49, 0x49, 0x2a, 0x00] }, // little-endian
  { mime: "image/tiff", bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // big-endian
  { mime: "image/bmp", bytes: [0x42, 0x4d] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

export interface StoredFile {
  storedPath: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface UploadValidationError {
  filename: string;
  reason: string;
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .substring(0, 255);
}

function detectMimeFromMagicBytes(buffer: Buffer): string | null {
  for (const entry of MAGIC_BYTES) {
    const offset = entry.offset ?? 0;
    if (buffer.length < offset + entry.bytes.length) continue;
    const matches = entry.bytes.every(
      (byte, i) => buffer[offset + i] === byte
    );
    if (matches) return entry.mime;
  }
  return null;
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/tiff": ".tiff",
    "image/bmp": ".bmp",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
  };
  return map[mimeType] || ".bin";
}

export function validateFile(
  file: Express.Multer.File
): UploadValidationError | null {
  // Check file size
  if (file.size > config.uploadMaxSizeBytes) {
    return {
      filename: file.originalname,
      reason: `File exceeds maximum size of ${config.uploadMaxSizeBytes / (1024 * 1024)} MB`,
    };
  }

  // Check declared MIME type
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return {
      filename: file.originalname,
      reason: `Unsupported file type: ${file.mimetype}. Allowed: ${Array.from(ALLOWED_MIME_TYPES).join(", ")}`,
    };
  }

  // Validate magic bytes match declared MIME type
  const detectedMime = detectMimeFromMagicBytes(file.buffer);
  if (!detectedMime) {
    return {
      filename: file.originalname,
      reason: "Unable to verify file type from content. File may be corrupted.",
    };
  }

  if (!ALLOWED_MIME_TYPES.has(detectedMime)) {
    return {
      filename: file.originalname,
      reason: `File content does not match an allowed type. Detected: ${detectedMime}`,
    };
  }

  return null;
}

export function storeFile(file: Express.Multer.File): StoredFile {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");

  const fileId = uuidv4();
  const detectedMime = detectMimeFromMagicBytes(file.buffer) || file.mimetype;
  const ext = getExtension(detectedMime);
  const storedFilename = `${fileId}${ext}`;

  const dirPath = path.join(config.originalsDir, year, month);
  fs.mkdirSync(dirPath, { recursive: true });

  const fullPath = path.join(dirPath, storedFilename);
  fs.writeFileSync(fullPath, file.buffer);

  // Store relative path from storage root
  const relativePath = path.relative(config.storageDir, fullPath);

  logger.info(
    { originalName: file.originalname, storedAs: relativePath, size: file.size },
    "File stored"
  );

  return {
    storedPath: relativePath,
    originalFilename: sanitizeFilename(file.originalname),
    mimeType: detectedMime,
    fileSizeBytes: file.size,
  };
}

export function deleteStoredFile(storedPath: string): void {
  const fullPath = path.join(config.storageDir, storedPath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    logger.info({ path: storedPath }, "File deleted");
  }
}

export function getOriginalFilePath(storedPath: string): string {
  return path.join(config.storageDir, storedPath);
}
