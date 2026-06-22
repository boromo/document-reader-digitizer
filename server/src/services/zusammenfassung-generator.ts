import { getOllamaClient } from "./ollama-client.js";
import { buildZusammenfassungPrompt, getAccountingSystemPrompt } from "./prompt-templates.js";
import type { AccountingFields } from "./accounting-field-extractor.js";
import type { Belegart } from "./belegart-detector.js";
import type { SkrMapping } from "./skr-mapper.js";
import { logger } from "../logger.js";

/**
 * Generates a German-language structured Zusammenfassung of the accounting record.
 */
export async function generateZusammenfassung(
  fields: AccountingFields,
  belegart: Belegart,
  skr: SkrMapping
): Promise<string> {
  const fieldsForPrompt = {
    belegart,
    ...fields,
    empfohlene_buchungskategorie: skr.konto
      ? `${skr.konto} – ${skr.name}`
      : "Nicht zugeordnet",
  };

  const prompt = buildZusammenfassungPrompt(
    JSON.stringify(fieldsForPrompt, null, 2)
  );

  try {
    const client = getOllamaClient();
    const zusammenfassung = await client.generate(prompt, {
      system: getAccountingSystemPrompt(),
      temperature: 0.2,
      maxTokens: 512,
    });

    logger.debug("Zusammenfassung generated");
    return zusammenfassung.trim();
  } catch (err) {
    logger.error({ err }, "Zusammenfassung generation failed");
    // Construct a minimal fallback summary without LLM
    const lines = [
      "Zusammenfassung:",
      `- Belegart: ${belegart}`,
      `- Aussteller: ${fields.aussteller ?? "–"}`,
      `- Empfänger: ${fields.empfaenger ?? "–"}`,
      `- Rechnungsdatum: ${fields.rechnungsdatum ?? "–"}`,
      `- Rechnungsnummer: ${fields.rechnungsnummer ?? "–"}`,
      `- Netto: ${fields.netto_betrag != null ? `${fields.netto_betrag.toFixed(2)} EUR` : "–"}`,
      `- Umsatzsteuer: ${fields.ust_betrag != null ? `${fields.ust_betrag.toFixed(2)} EUR` : "–"}`,
      `- Brutto: ${fields.brutto_betrag != null ? `${fields.brutto_betrag.toFixed(2)} EUR` : "–"}`,
      `- Zahlungsstatus: ${fields.zahlungsstatus ?? "unbekannt"}`,
      `- Empfohlene Buchungskategorie: ${skr.konto ? `${skr.konto} – ${skr.name}` : "Nicht zugeordnet"}`,
      `- Offene Fragen: ${fields.offene_fragen.length > 0 ? fields.offene_fragen.join("; ") : "keine"}`,
    ];
    return lines.join("\n");
  }
}
