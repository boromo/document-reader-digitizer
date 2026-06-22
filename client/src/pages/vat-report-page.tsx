import { useEffect, useState } from "react";
import { api } from "#/lib/api";
import { LegalDisclaimerBanner } from "#/components/legal-disclaimer-banner";

interface VatRow {
  ust_satz: number | null;
  belegart: string;
  netto_summe: number;
  ust_summe: number;
  belege_count: number;
}

export function VatReportPage() {
  const [rows, setRows] = useState<VatRow[]>([]);
  const [, setPeriod] = useState<{ from: string | null; to: string | null }>(
    { from: null, to: null }
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .getVatReport({ from: from || undefined, to: to || undefined })
      .then((data) => {
        setRows(data.rows as VatRow[]);
        setPeriod(data.period);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalUstEingenommen = rows
    .filter((r) => r.belegart === "ausgangsrechnung")
    .reduce((s, r) => s + r.ust_summe, 0);

  const totalUstGezahlt = rows
    .filter((r) => r.belegart === "eingangsrechnung")
    .reduce((s, r) => s + r.ust_summe, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          VAT Report
        </h1>
        <p className="text-sm text-gray-500">
          Data for VAT advance return (Umsatzsteuervoranmeldung)
        </p>
      </div>

      <LegalDisclaimerBanner />

      {/* Period filter */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={load}
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs text-green-700">VAT collected (outgoing invoices)</p>
          <p className="mt-1 text-xl font-bold text-green-800">
            {totalUstEingenommen.toFixed(2)} EUR
          </p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs text-blue-700">Input tax paid (incoming invoices)</p>
          <p className="mt-1 text-xl font-bold text-blue-800">
            {totalUstGezahlt.toFixed(2)} EUR
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">VAT Payable</p>
          <p
            className={`mt-1 text-xl font-bold ${
              totalUstEingenommen - totalUstGezahlt >= 0
                ? "text-red-600"
                : "text-green-700"
            }`}
          >
            {(totalUstEingenommen - totalUstGezahlt).toFixed(2)} EUR
          </p>
        </div>
      </div>

      {/* Detail table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-2 text-left">Document Type</th>
              <th className="px-4 py-2 text-right">VAT Rate</th>
              <th className="px-4 py-2 text-right">Net Total</th>
              <th className="px-4 py-2 text-right">VAT Total</th>
              <th className="px-4 py-2 text-right">Documents</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-gray-400"
                >
                  {loading ? "Loading…" : "No confirmed documents for this period"}
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2 capitalize">{row.belegart}</td>
                <td className="px-4 py-2 text-right">
                  {row.ust_satz != null
                    ? `${(row.ust_satz * 100).toFixed(0)} %`
                    : "–"}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {row.netto_summe.toFixed(2)} EUR
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {row.ust_summe.toFixed(2)} EUR
                </td>
                <td className="px-4 py-2 text-right">{row.belege_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
