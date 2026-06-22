import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "#/lib/api";
import type { BankTransaction } from "#/types/models";
import { LegalDisclaimerBanner } from "#/components/legal-disclaimer-banner";

type TxWithDoc = BankTransaction & {
  document_id: number;
  original_filename: string;
};

const STATUS_CONFIG: Record<
  BankTransaction["status"],
  { label: string; color: string }
> = {
  matched: { label: "Matched", color: "text-green-700" },
  unmatched: { label: "Unmatched", color: "text-amber-600" },
  needs_clarification: { label: "Needs Clarification", color: "text-red-600" },
};

export function BankTransactionsPage() {
  const [transactions, setTransactions] = useState<TxWithDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .listBankTransactions({ status: statusFilter || undefined })
      .then((data) => {
        setTransactions(data.transactions);
        setTotal(data.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bank Transactions</h1>
        <p className="text-sm text-gray-500">
          Transactions extracted from bank statements
        </p>
      </div>

      <LegalDisclaimerBanner />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        {(["", "unmatched", "matched", "needs_clarification"] as const).map(
          (s) => (
            <button
              type="button"
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                statusFilter === s
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 text-gray-600 hover:border-gray-500"
              }`}
            >
              {s === "" ? "Alle" : STATUS_CONFIG[s]?.label ?? s}
            </button>
          )
        )}
        <span className="ml-auto self-center text-sm text-gray-400">
          {total} Transaktionen
        </span>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Sender / Recipient</th>
              <th className="px-4 py-2 text-left">Payment Reference</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Bank Statement</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  No bank transactions found
                </td>
              </tr>
            )}
            {transactions.map((tx) => {
              const statusCfg = STATUS_CONFIG[tx.status];
              const isPositive = (tx.betrag ?? 0) >= 0;

              return (
                <tr
                  key={tx.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-2 text-gray-500">
                    {tx.buchungsdatum ?? "–"}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-2 text-gray-700">
                    {tx.sender_empfaenger ?? "–"}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-gray-500">
                    {tx.verwendungszweck ?? "–"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-mono font-medium ${
                      isPositive ? "text-green-700" : "text-red-600"
                    }`}
                  >
                    {tx.betrag != null
                      ? `${isPositive ? "+" : ""}${tx.betrag.toFixed(2)} ${tx.waehrung}`
                      : "–"}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {tx.booking_category ?? "–"}
                  </td>
                  <td
                    className={`px-4 py-2 text-xs font-medium ${statusCfg.color}`}
                  >
                    {statusCfg.label}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      to={`/accounting/${tx.document_id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {tx.original_filename}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
