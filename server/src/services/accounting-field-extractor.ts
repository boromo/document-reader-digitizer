import { getOllamaClient } from "./ollama-client.js";
import {
  buildAccountingFieldExtractionPrompt,
  getAccountingSystemPrompt,
} from "./prompt-templates.js";
import { extractAccountingFieldsWithVision } from "./vision-extractor.js";
import { logger } from "../logger.js";

export interface AccountingFields {
  aussteller: string | null;
  empfaenger: string | null;
  rechnungsnummer: string | null;
  rechnungsdatum: string | null;
  leistungsdatum: string | null;
  faelligkeitsdatum: string | null;
  netto_betrag: number | null;
  ust_satz: number | null;
  ust_betrag: number | null;
  brutto_betrag: number | null;
  iban: string | null;
  verwendungszweck: string | null;
  zahlungsstatus: "offen" | "bezahlt" | "teilweise_bezahlt" | null;
  offene_fragen: string[];
}

const VALID_ZAHLUNGSSTATUS = new Set(["offen", "bezahlt", "teilweise_bezahlt"]);

function parseJsonResponse<T>(response: string): T {
  let cleaned = response.trim();
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) cleaned = jsonBlockMatch[1].trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];
  return JSON.parse(cleaned) as T;
}

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(",", "."));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function toString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

/**
 * Extracts structured German accounting fields (§14 UStG).
 *
 * When an imagePath is provided, the vision LLM is used as the primary path
 * (layout-aware, preserves column structure). Falls back to text-based LLM
 * if vision fails or no imagePath is given.
 */
export async function extractAccountingFields(
  rawText: string,
  imagePath?: string
): Promise<AccountingFields> {
  const empty: AccountingFields = {
    aussteller: null,
    empfaenger: null,
    rechnungsnummer: null,
    rechnungsdatum: null,
    leistungsdatum: null,
    faelligkeitsdatum: null,
    netto_betrag: null,
    ust_satz: null,
    ust_betrag: null,
    brutto_betrag: null,
    iban: null,
    verwendungszweck: null,
    zahlungsstatus: null,
    offene_fragen: [],
  };

  // --- Vision path (primary) ---
  if (imagePath) {
    try {
      const result = await extractAccountingFieldsWithVision(imagePath);
      logger.info(
        {
          rechnungsnummer: result.rechnungsnummer,
          brutto_betrag: result.brutto_betrag,
          via: "vision",
        },
        "Accounting fields extracted"
      );
      return result;
    } catch (err) {
      logger.warn(
        { err, imagePath },
        "Vision accounting field extraction failed — falling back to text LLM"
      );
    }
  }

  // --- Text LLM fallback ---
  const client = getOllamaClient();
  const prompt = buildAccountingFieldExtractionPrompt(rawText);

  try {
    const response = await client.generate(prompt, {
      system: getAccountingSystemPrompt(),
      temperature: 0.1,
      maxTokens: 1024,
    });

    const raw = parseJsonResponse<Record<string, unknown>>(response);

    const zahlungsstatusRaw = toString(raw.zahlungsstatus);
    const zahlungsstatus =
      zahlungsstatusRaw && VALID_ZAHLUNGSSTATUS.has(zahlungsstatusRaw)
        ? (zahlungsstatusRaw as AccountingFields["zahlungsstatus"])
        : null;

    const offeneFragenRaw = raw.offene_fragen;
    const offene_fragen =
      Array.isArray(offeneFragenRaw)
        ? offeneFragenRaw
            .map((q) => String(q).trim())
            .filter((q) => q.length > 0)
        : [];

    const fields: AccountingFields = {
      aussteller: toString(raw.aussteller),
      empfaenger: toString(raw.empfaenger),
      rechnungsnummer: toString(raw.rechnungsnummer),
      rechnungsdatum: toString(raw.rechnungsdatum),
      leistungsdatum: toString(raw.leistungsdatum),
      faelligkeitsdatum: toString(raw.faelligkeitsdatum),
      netto_betrag: toNumber(raw.netto_betrag),
      ust_satz: toNumber(raw.ust_satz),
      ust_betrag: toNumber(raw.ust_betrag),
      brutto_betrag: toNumber(raw.brutto_betrag),
      iban: toString(raw.iban),
      verwendungszweck: toString(raw.verwendungszweck),
      zahlungsstatus,
      offene_fragen,
    };

    logger.info(
      {
        rechnungsnummer: fields.rechnungsnummer,
        brutto_betrag: fields.brutto_betrag,
        ust_satz: fields.ust_satz,
        via: "text",
      },
      "Accounting fields extracted"
    );

    return fields;
  } catch (err) {
    logger.error({ err }, "Accounting field extraction failed, returning empty");
    return empty;
  }
}
