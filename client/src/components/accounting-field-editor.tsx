import { useState } from "react";
import type { AccountingRecord } from "#/types/models";
import { api } from "#/lib/api";

interface AccountingFieldEditorProps {
  record: AccountingRecord;
  onSaved: () => void;
}

const EDITABLE_FIELDS: Array<{
  key: keyof AccountingRecord;
  label: string;
  type: "text" | "number" | "date" | "select";
  options?: Array<{ value: string; label: string }>;
}> = [
  { key: "aussteller", label: "Supplier / Issuer", type: "text" },
  { key: "empfaenger", label: "Recipient", type: "text" },
  { key: "rechnungsnummer", label: "Invoice Number", type: "text" },
  { key: "rechnungsdatum", label: "Invoice Date", type: "date" },
  { key: "leistungsdatum", label: "Service Date", type: "date" },
  { key: "faelligkeitsdatum", label: "Due Date", type: "date" },
  { key: "netto_betrag", label: "Net Amount (EUR)", type: "number" },
  { key: "ust_satz", label: "VAT Rate (0 | 0.07 | 0.19)", type: "number" },
  { key: "ust_betrag", label: "VAT Amount (EUR)", type: "number" },
  { key: "brutto_betrag", label: "Gross Amount (EUR)", type: "number" },
  { key: "iban", label: "IBAN", type: "text" },
  { key: "verwendungszweck", label: "Payment Reference", type: "text" },
  {
    key: "zahlungsstatus",
    label: "Payment Status",
    type: "select",
    options: [
      { value: "offen", label: "Open" },
      { value: "bezahlt", label: "Paid" },
      { value: "teilweise_bezahlt", label: "Partially Paid" },
      { value: "unbekannt", label: "Unknown" },
    ],
  },
  { key: "skr_konto", label: "SKR03 Account", type: "text" },
  { key: "skr_konto_name", label: "SKR03 Account Name", type: "text" },
];

export function AccountingFieldEditor({
  record,
  onSaved,
}: AccountingFieldEditorProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) {
      const val = record[f.key];
      init[f.key] = val !== null && val !== undefined ? String(val) : "";
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of EDITABLE_FIELDS) {
        const raw = values[f.key];
        if (raw === "" || raw === undefined) {
          payload[f.key] = null;
        } else if (f.type === "number") {
          const n = parseFloat(raw.replace(",", "."));
          payload[f.key] = isNaN(n) ? null : n;
        } else {
          payload[f.key] = raw;
        }
      }
      await api.updateAccountingFields(record.document_id, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {EDITABLE_FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              {field.label}
            </label>
            {field.type === "select" ? (
              <select
                value={values[field.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === "number" ? "text" : field.type}
                value={values[field.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
                className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                placeholder={field.type === "date" ? "YYYY-MM-DD" : ""}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Fields"}
      </button>
    </div>
  );
}
