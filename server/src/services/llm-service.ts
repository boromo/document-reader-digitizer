import { getOllamaClient } from "./ollama-client.js";
import {
  buildClassificationPrompt,
  buildExtractionPrompt,
  buildSummaryPrompt,
  buildSentimentPrompt,
  getSystemPrompt,
} from "./prompt-templates.js";
import { getDb } from "../db/database.js";
import { chunkText, mergeClassifications, mergeExtractions } from "./text-chunker.js";
import type { DocumentType } from "../types/models.js";
import { logger } from "../logger.js";

export interface ClassificationResult {
  type: string;
  confidence: number;
}

export interface ExtractionResult {
  fields: Record<string, unknown>;
}

export interface SummaryResult {
  summary: string;
}

export interface SentimentResult {
  sentiment: string;
  intent: string;
}

function parseJsonResponse<T>(response: string): T {
  // Try to extract JSON from the response, handling cases where the LLM
  // wraps it in markdown code blocks or adds extra text
  let cleaned = response.trim();

  // Remove markdown code fences if present
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // Try to find JSON object in the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  return JSON.parse(cleaned) as T;
}

function getDocumentTypes(): DocumentType[] {
  const db = getDb();
  return db.prepare("SELECT * FROM document_types").all() as DocumentType[];
}

function getDocumentTypeByName(name: string): DocumentType | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM document_types WHERE name = ?")
    .get(name);
  return (row as DocumentType) ?? null;
}

export async function classifyDocument(
  text: string
): Promise<ClassificationResult> {
  const client = getOllamaClient();
  const types = getDocumentTypes();
  const chunks = chunkText(text);

  if (chunks.length === 1) {
    const prompt = buildClassificationPrompt(chunks[0], types);
    const response = await client.generate(prompt, {
      system: getSystemPrompt(),
      temperature: 0.1,
    });

    const result = parseJsonResponse<ClassificationResult>(response);
    logger.info({ type: result.type, confidence: result.confidence }, "Document classified");
    return result;
  }

  // Multi-chunk: classify each chunk and take majority vote
  const chunkResults: ClassificationResult[] = [];
  for (const chunk of chunks) {
    const prompt = buildClassificationPrompt(chunk, types);
    const response = await client.generate(prompt, {
      system: getSystemPrompt(),
      temperature: 0.1,
    });
    chunkResults.push(parseJsonResponse<ClassificationResult>(response));
  }

  return mergeClassifications(chunkResults);
}

export async function extractFields(
  text: string,
  documentType: string
): Promise<ExtractionResult> {
  const client = getOllamaClient();
  const docType = getDocumentTypeByName(documentType);
  const extractionPrompt =
    docType?.extraction_prompt ??
    "Extract any identifiable structured fields from this document. Return as JSON with descriptive field names.";

  const chunks = chunkText(text);

  if (chunks.length === 1) {
    const prompt = buildExtractionPrompt(chunks[0], extractionPrompt);
    const response = await client.generate(prompt, {
      system: getSystemPrompt(),
      temperature: 0.1,
    });

    const fields = parseJsonResponse<Record<string, unknown>>(response);
    logger.info({ fieldCount: Object.keys(fields).length }, "Fields extracted");
    return { fields };
  }

  // Multi-chunk: extract from each chunk and merge
  const chunkResults: Record<string, unknown>[] = [];
  for (const chunk of chunks) {
    const prompt = buildExtractionPrompt(chunk, extractionPrompt);
    const response = await client.generate(prompt, {
      system: getSystemPrompt(),
      temperature: 0.1,
    });
    chunkResults.push(parseJsonResponse<Record<string, unknown>>(response));
  }

  return { fields: mergeExtractions(chunkResults) };
}

export async function summarizeDocument(
  text: string
): Promise<SummaryResult> {
  const client = getOllamaClient();
  const chunks = chunkText(text);

  if (chunks.length === 1) {
    const prompt = buildSummaryPrompt(chunks[0]);
    const response = await client.generate(prompt, {
      system: getSystemPrompt(),
      temperature: 0.3,
    });

    const result = parseJsonResponse<SummaryResult>(response);
    logger.info({ summaryLength: result.summary.length }, "Document summarized");
    return result;
  }

  // Multi-chunk: summarize each chunk, then re-summarize the combined summaries
  const chunkSummaries: string[] = [];
  for (const chunk of chunks) {
    const prompt = buildSummaryPrompt(chunk);
    const response = await client.generate(prompt, {
      system: getSystemPrompt(),
      temperature: 0.3,
    });
    const result = parseJsonResponse<SummaryResult>(response);
    chunkSummaries.push(result.summary);
  }

  // Re-summarize the combined chunk summaries
  const combined = chunkSummaries.join("\n\n");
  const finalPrompt = buildSummaryPrompt(combined);
  const finalResponse = await client.generate(finalPrompt, {
    system: getSystemPrompt(),
    temperature: 0.3,
  });

  return parseJsonResponse<SummaryResult>(finalResponse);
}

export async function analyzeSentiment(
  text: string
): Promise<SentimentResult> {
  const client = getOllamaClient();
  // Sentiment uses only the beginning of the document
  const truncated = text.substring(0, 8000);

  const prompt = buildSentimentPrompt(truncated);
  const response = await client.generate(prompt, {
    system: getSystemPrompt(),
    temperature: 0.1,
  });

  const result = parseJsonResponse<SentimentResult>(response);
  logger.info(
    { sentiment: result.sentiment, intent: result.intent },
    "Sentiment analyzed"
  );
  return result;
}
