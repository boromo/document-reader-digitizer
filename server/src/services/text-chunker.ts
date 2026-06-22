import type { ClassificationResult } from "./llm-service.js";

const CHUNK_SIZE_CHARS = 12000; // ~3000 tokens
const OVERLAP_CHARS = 800; // ~200 tokens

export function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE_CHARS) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + CHUNK_SIZE_CHARS;

    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      const searchRegion = text.substring(end - 200, end + 200);
      const breakPoints = [
        searchRegion.lastIndexOf("\n\n"),
        searchRegion.lastIndexOf(".\n"),
        searchRegion.lastIndexOf(". "),
        searchRegion.lastIndexOf("\n"),
      ];

      for (const bp of breakPoints) {
        if (bp !== -1) {
          end = end - 200 + bp + 1;
          break;
        }
      }
    }

    end = Math.min(end, text.length);
    chunks.push(text.substring(start, end));

    // Move start forward, but leave overlap
    start = end - OVERLAP_CHARS;
    if (start >= text.length) break;
  }

  return chunks;
}

export function mergeClassifications(
  results: ClassificationResult[]
): ClassificationResult {
  // Majority vote with confidence weighting
  const votes = new Map<string, { count: number; totalConfidence: number }>();

  for (const result of results) {
    const existing = votes.get(result.type) || {
      count: 0,
      totalConfidence: 0,
    };
    existing.count += 1;
    existing.totalConfidence += result.confidence;
    votes.set(result.type, existing);
  }

  let bestType = "other";
  let bestScore = -1;

  for (const [type, { count, totalConfidence }] of votes) {
    // Score combines vote count and average confidence
    const score = count * (totalConfidence / count);
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  const winner = votes.get(bestType)!;
  return {
    type: bestType,
    confidence: winner.totalConfidence / winner.count,
  };
}

export function mergeExtractions(
  results: Record<string, unknown>[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  for (const result of results) {
    for (const [key, value] of Object.entries(result)) {
      if (value === null || value === undefined || value === "") continue;

      if (!(key in merged)) {
        merged[key] = value;
      } else if (Array.isArray(merged[key]) && Array.isArray(value)) {
        // Merge arrays (e.g., line_items from different chunks)
        (merged[key] as unknown[]).push(...(value as unknown[]));
      }
      // For non-array duplicates, keep the first non-empty value
    }
  }

  return merged;
}
