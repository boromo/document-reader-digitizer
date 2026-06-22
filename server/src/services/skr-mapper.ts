import { getOllamaClient } from "./ollama-client.js";
import { buildSkrMappingPrompt, getAccountingSystemPrompt } from "./prompt-templates.js";
import type { Belegart } from "./belegart-detector.js";
import { logger } from "../logger.js";

export interface SkrMapping {
  konto: string;
  name: string;
  confidence: number;
}

interface StaticRule {
  keywords: string[];
  konto: string;
  name: string;
}

// SKR03 static rules — checked before LLM fallback
// Key: belegart -> array of keyword rules
const SKR03_RULES: Partial<Record<Belegart, StaticRule[]>> = {
  eingangsrechnung: [
    { keywords: ["bürobedarf", "papier", "druckerpatrone", "büroartikel", "schreibware"], konto: "4930", name: "Bürobedarf" },
    { keywords: ["telefon", "internet", "mobilfunk", "telekom", "vodafone", "o2"], konto: "4920", name: "Telefon" },
    { keywords: ["miete", "pacht", "raummiete"], konto: "4210", name: "Miete" },
    { keywords: ["strom", "gas", "wasser", "energie", "heizung", "stadtwerke"], konto: "4240", name: "Heizung, Licht, Energie" },
    { keywords: ["versicherung", "beitrag", "haftpflicht", "gebäudeversicherung"], konto: "4360", name: "Beiträge und Versicherungen" },
    { keywords: ["kraftstoff", "tankstelle", "benzin", "diesel", "kfz", "auto", "fahrzeug"], konto: "4530", name: "Kfz-Kosten" },
    { keywords: ["amazon", "mediamarkt", "saturn", "hardware", "it", "computer", "laptop", "monitor", "drucker"], konto: "0680", name: "Betriebs- und Geschäftsausstattung" },
    { keywords: ["software", "lizenz", "saas", "abo", "subscription"], konto: "4930", name: "Bürobedarf (Software)" },
    { keywords: ["porto", "brief", "paket", "dhl", "dpd", "hermes", "versand"], konto: "4910", name: "Porto" },
    { keywords: ["steuerberater", "rechtsanwalt", "notar", "beratung", "wirtschaftsprüfer"], konto: "4970", name: "Rechts- und Beratungskosten" },
    { keywords: ["werbung", "marketing", "anzeige", "flyer", "druck"], konto: "4610", name: "Werbekosten" },
    { keywords: ["reise", "hotel", "übernachtung", "bahn", "flug", "taxi"], konto: "4670", name: "Reisekosten" },
    { keywords: ["bewirtung", "restaurant", "essen", "getränke", "catering"], konto: "4650", name: "Bewirtungskosten" },
  ],
  ausgangsrechnung: [
    // These are caught by the belegart itself; ust_satz determines the account
    // Default: 19% revenue
    { keywords: [], konto: "8400", name: "Erlöse 19% USt" },
  ],
  quittung: [
    { keywords: ["bewirtung", "restaurant", "essen", "getränke", "café"], konto: "4650", name: "Bewirtungskosten" },
    { keywords: ["porto", "brief", "dhl"], konto: "4910", name: "Porto" },
    { keywords: ["bürobedarf", "papier", "schreibware"], konto: "4930", name: "Bürobedarf" },
    { keywords: ["taxi", "parkhaus", "bahn"], konto: "4670", name: "Reisekosten" },
  ],
  lohnabrechnung: [
    { keywords: [], konto: "4120", name: "Gehälter" },
  ],
  kontoauszug: [
    // Kontoauszüge themselves are not booked; they match against Rechnungen
    { keywords: [], konto: "1200", name: "Bank" },
  ],
};

function parseJsonResponse<T>(response: string): T {
  let cleaned = response.trim();
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) cleaned = jsonBlockMatch[1].trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];
  return JSON.parse(cleaned) as T;
}

function matchStaticRule(
  belegart: Belegart,
  text: string,
  ustSatz: number | null
): SkrMapping | null {
  const rules = SKR03_RULES[belegart];
  if (!rules) return null;

  const lowerText = text.toLowerCase();

  // Special case: Ausgangsrechnung — account depends on VAT rate
  if (belegart === "ausgangsrechnung") {
    if (ustSatz === 0.07) {
      return { konto: "8300", name: "Erlöse 7% USt", confidence: 0.9 };
    }
    if (ustSatz === 0) {
      return { konto: "8200", name: "Erlöse steuerfrei", confidence: 0.85 };
    }
    return { konto: "8400", name: "Erlöse 19% USt", confidence: 0.9 };
  }

  // Lohnabrechnung and Kontoauszug — single rule regardless of keywords
  if (rules.length === 1 && rules[0].keywords.length === 0) {
    return { konto: rules[0].konto, name: rules[0].name, confidence: 0.85 };
  }

  // Keyword matching
  for (const rule of rules) {
    if (rule.keywords.some((kw) => lowerText.includes(kw))) {
      return { konto: rule.konto, name: rule.name, confidence: 0.88 };
    }
  }

  return null;
}

/**
 * Maps a document to an SKR03 account number.
 * Tries static rules first; falls back to LLM when no rule matches.
 */
export async function mapSkrAccount(
  belegart: Belegart,
  description: string,
  ustSatz: number | null
): Promise<SkrMapping> {
  const staticResult = matchStaticRule(belegart, description, ustSatz);
  if (staticResult) {
    logger.debug({ konto: staticResult.konto, source: "static" }, "SKR account mapped via rule");
    return staticResult;
  }

  // LLM fallback
  try {
    const client = getOllamaClient();
    const prompt = buildSkrMappingPrompt(belegart, description);
    const response = await client.generate(prompt, {
      system: getAccountingSystemPrompt(),
      temperature: 0.05,
      maxTokens: 128,
    });

    const parsed = parseJsonResponse<{ konto: string; name: string; confidence: number }>(
      response
    );

    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.3;

    logger.info(
      { konto: parsed.konto, confidence, source: "llm" },
      "SKR account mapped via LLM"
    );

    return {
      konto: String(parsed.konto ?? "").trim(),
      name: String(parsed.name ?? "").trim(),
      confidence,
    };
  } catch (err) {
    logger.error({ err }, "SKR mapping LLM fallback failed");
    return { konto: "", name: "Nicht zugeordnet", confidence: 0 };
  }
}
