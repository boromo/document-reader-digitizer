import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "#/lib/api";
import type { AccountingSummary, AccountingRecord } from "#/types/models";
import { LegalDisclaimerBanner } from "#/components/legal-disclaimer-banner";
import { DatevExportButton } from "#/components/datev-export-button";

const BELEGART_LABELS: Record<string, string> = {
  eingangsrechnung: "Incoming Invoice",
  ausgangsrechnung: "Outgoing Invoice",
  quittung: "Receipt",
  kontoauszug: "Bank Statement",
  mahnung: "Dunning Notice",
  lohnabrechnung: "Payroll",
  vertrag: "Contract",
  datev_export: "DATEV Export",
  unbekannt: "Unknown",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-gray-500" },
  review: { label: "Needs Review", color: "text-blue-600" },
  confirmed: { label: "Confirmed", color: "text-green-600" },
  needs_clarification: { label: "Needs Clarification", color: "text-amber-600" },
};

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "positive" | "negative" | "neutral";
}) {
  const colors = {
    positive: "text-green-700",
    negative: "text-red-600",
    neutral: "text-gray-900",
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${colors[highlight ?? "neutral"]}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function formatEur(val: number): string {
  return `${val.toFixed(2)} EUR`;
}

export function AccountingDashboardPage() {
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [recentRecords, setRecentRecords] = useState<AccountingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.getAccountingSummary(),
      api.listAccountingRecords({ limit: 20 }),
    ])
      .then(([sum, list]) => {
        setSummary(sum);
        setRecentRecords(list.records);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div className="py-8 text-center text-gray-500">Loading…</div>;
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        {error}
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Accounting Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            Overview of all recognized documents and bookkeeping data
          </p>
        </div>
        <DatevExportButton />
      </div>

      <LegalDisclaimerBanner />

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Revenue (Net)"
            value={formatEur(summary.einnahmen_netto)}
            highlight="positive"
          />
          <StatCard
            label="Expenses (Net)"
            value={formatEur(summary.ausgaben_netto)}
            highlight="negative"
          />
          <StatCard
            label="VAT Payable"
            value={formatEur(summary.ust_zahllast)}
            sub={`Collected: ${formatEur(summary.ust_eingenommen)} / Paid: ${formatEur(summary.ust_gezahlt)}`}
            highlight={summary.ust_zahllast >= 0 ? "negative" : "positive"}
          />
          <StatCard
            label="Open Receivables"
            value={formatEur(summary.offene_forderungen_betrag)}
            sub={`${summary.offene_forderungen_count} documents`}
            highlight="neutral"
          />
          <StatCard
            label="Open Payables"
            value={formatEur(summary.offene_verbindlichkeiten_betrag)}
            sub={`${summary.offene_verbindlichkeiten_count} documents`}
            highlight="neutral"
          />
          <StatCard
            label="Missing Docs / Needs Clarification"
            value={`${summary.fehlende_belege} / ${summary.klaerungsbedarf}`}
            highlight={
              summary.fehlende_belege + summary.klaerungsbedarf > 0
                ? "negative"
                : "positive"
            }
          />
        </div>
      )}

      {/* Recent records table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="font-semibold text-gray-800">Recent Documents</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Issuer</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-right">Gross</th>
                <th className="px-4 py-2 text-left">Payment</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {recentRecords.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-gray-400"
                  >
                    No accounting documents yet
                  </td>
                </tr>
              )}
              {recentRecords.map((r) => {
                const statusCfg =
                  STATUS_LABELS[r.accounting_status] ?? STATUS_LABELS.pending;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2">
                      {BELEGART_LABELS[r.belegart] ?? r.belegart}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2 text-gray-700">
                      {r.aussteller ?? "–"}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {r.rechnungsdatum ?? "–"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {r.brutto_betrag != null
                        ? `${r.brutto_betrag.toFixed(2)} EUR`
                        : "–"}
                    </td>
                    <td className="px-4 py-2 capitalize text-gray-600">
                      {r.zahlungsstatus}
                    </td>
                    <td className={`px-4 py-2 text-xs font-medium ${statusCfg.color}`}>
                      {statusCfg.label}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        to={`/accounting/${r.document_id}`}
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
    </div>
  );
}
