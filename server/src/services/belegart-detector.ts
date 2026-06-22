import { getOllamaClient } from "./ollama-client.js";
import {
  buildBelegarttDetectionPrompt,
  getAccountingSystemPrompt,
} from "./prompt-templates.js";
import { detectBelegarttWithVision } from "./vision-extractor.js";
import { logger } from "../logger.js";

export type Belegart =
  | "eingangsrechnung"
  | "ausgangsrechnung"
  | "quittung"
  | "kontoauszug"
  | "mahnung"
  | "lohnabrechnung"
  | "vertrag"
  | "datev_export"
  | "unbekannt";

export interface BelegarttDetectionResult {
  belegart: Belegart;
  confidence: number;
}

const VALID_BELEGARTEN = new Set<Belegart>([
  "eingangsrechnung",
  "ausgangsrechnung",
  "quittung",
  "kontoauszug",
  "mahnung",
  "lohnabrechnung",
  "vertrag",
  "datev_export",
  "unbekannt",
]);

function parseJsonResponse<T>(response: string): T {
  let cleaned = response.trim();
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) cleaned = jsonBlockMatch[1].trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];
  return JSON.parse(cleaned) as T;
}

/**
 * Detects the German accounting document type (Belegart).
 *
 * When an imagePath is provided, the vision LLM is used as the primary path
 * (layout-aware, higher accuracy). If vision fails or no imagePath is given,
 * falls back to the text-based LLM using OCR raw text.
 *
 * Falls back to "unbekannt" if both paths fail.
 */
export async function detectBelegart(
  rawText: string,
  imagePath?: string
): Promise<BelegarttDetectionResult> {
  // --- Vision path (primary) ---
  if (imagePath) {
    try {
      const result = await detectBelegarttWithVision(imagePath);
      logger.info(
        { belegart: result.belegart, confidence: result.confidence, via: "vision" },
        "Belegart detected"
      );
      return result;
    } catch (err) {
      logger.warn(
        { err, imagePath },
        "Vision Belegart detection failed — falling back to text LLM"
      );
    }
  }

  // --- Text LLM fallback ---
  const client = getOllamaClient();
  const prompt = buildBelegarttDetectionPrompt(rawText);

  try {
    const response = await client.generate(prompt, {
      system: getAccountingSystemPrompt(),
      temperature: 0.05,
    });

    const parsed = parseJsonResponse<{ belegart: string; confidence: number }>(
      response
    );

    const belegart = VALID_BELEGARTEN.has(parsed.belegart as Belegart)
      ? (parsed.belegart as Belegart)
      : "unbekannt";

    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;

    logger.info({ belegart, confidence, via: "text" }, "Belegart detected");
    return { belegart, confidence };
  } catch (err) {
    logger.error({ err }, "Belegart detection failed, defaulting to unbekannt");
    return { belegart: "unbekannt", confidence: 0 };
  }
}

/**
 * Returns true if the document type warrants a full accounting agent pass.
 * Accounting types that have structured bookkeeping data worth extracting.
 */
export function isAccountingDocument(belegart: Belegart): boolean {
  return belegart !== "unbekannt";
}
