import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { api } from "#/lib/api";
import type { AccountingRecord } from "#/types/models";
import { LegalDisclaimerBanner } from "#/components/legal-disclaimer-banner";

export function OpenItemsPage() {
  const [items, setItems] = useState<AccountingRecord[]>([]);
  const [, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOpenItems()
      .then((data) => {
        setItems(data.items as AccountingRecord[]);
        setTotal(data.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const forderungen = items.filter((i) => i.belegart === "ausgangsrechnung");
  const verbindlichkeiten = items.filter((i) => i.belegart === "eingangsrechnung");

  const sumForderungen = forderungen.reduce(
    (s, i) => s + (i.brutto_betrag ?? 0),
    0
  );
  const sumVerbindlichkeiten = verbindlichkeiten.reduce(
    (s, i) => s + (i.brutto_betrag ?? 0),
    0
  );

  if (loading)
    return <div className="py-8 text-center text-gray-500">Loading…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Open Items</h1>
        <p className="text-sm text-gray-500">
          Unpaid receivables and payables
        </p>
      </div>

      <LegalDisclaimerBanner />

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs text-green-700">Open Receivables</p>
          <p className="mt-1 text-xl font-bold text-green-800">
            {sumForderungen.toFixed(2)} EUR
          </p>
          <p className="text-xs text-green-600">{forderungen.length} documents</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-red-700">Open Payables</p>
          <p className="mt-1 text-xl font-bold text-red-800">
            {sumVerbindlichkeiten.toFixed(2)} EUR
          </p>
          <p className="text-xs text-red-600">{verbindlichkeiten.length} documents</p>
        </div>
      </div>

      {[
        { label: "Open Receivables (Outgoing Invoices)", data: forderungen },
        {
          label: "Open Payables (Incoming Invoices)",
          data: verbindlichkeiten,
        },
      ].map(({ label, data }) => (
        <div key={label} className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-2 text-left">Invoice Number</th>
                <th className="px-4 py-2 text-left">Issuer / Recipient</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Due Date</th>
                <th className="px-4 py-2 text-right">Gross</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-4 text-center text-gray-400"
                    >
                      No open items
                    </td>
                  </tr>
                )}
                {data.map((item) => {
                  const isOverdue =
                    item.faelligkeitsdatum &&
                    item.faelligkeitsdatum < new Date().toISOString().split("T")[0];

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-2">
                        {item.rechnungsnummer ?? "–"}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2 text-gray-700">
                        {item.aussteller ?? item.empfaenger ?? "–"}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {item.rechnungsdatum ?? "–"}
                      </td>
                      <td
                        className={`px-4 py-2 ${
                          isOverdue ? "font-medium text-red-600" : "text-gray-500"
                        }`}
                      >
                        {item.faelligkeitsdatum ?? "–"}
                        {isOverdue && (
                          <AlertCircle className="ml-1 inline h-3.5 w-3.5" />
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {item.brutto_betrag != null
                          ? `${item.brutto_betrag.toFixed(2)} EUR`
                          : "–"}
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          to={`/accounting/${item.document_id}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
