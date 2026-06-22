import sharp from "sharp";
import { logger } from "../logger.js";

export async function preprocessImage(
  inputPath: string,
  outputPath: string
): Promise<void> {
  try {
    await sharp(inputPath)
      // Convert to grayscale for better OCR
      .grayscale()
      // Normalize contrast (stretch histogram)
      .normalize()
      // Sharpen to make text edges crisper
      .sharpen({ sigma: 1.5 })
      // Resize if very large (keep aspect ratio, max 4000px on longest side)
      .resize(4000, 4000, {
        fit: "inside",
        withoutEnlargement: true,
      })
      // Output as PNG (lossless, good for OCR)
      .png()
      .toFile(outputPath);

    logger.debug({ inputPath, outputPath }, "Image preprocessed for OCR");
  } catch (err) {
    logger.warn(
      { inputPath, err },
      "Image preprocessing failed, using original"
    );
    // If preprocessing fails, copy original as-is
    const fs = await import("node:fs");
    fs.copyFileSync(inputPath, outputPath);
  }
}

export async function generateThumbnail(
  inputPath: string,
  outputPath: string
): Promise<void> {
  await sharp(inputPath)
    .resize(300, 400, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toFile(outputPath);

  logger.debug({ inputPath, outputPath }, "Thumbnail generated");
}
