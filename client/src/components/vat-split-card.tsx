import type { ReceiptItem } from "#/types/models";

interface VatSplitCardProps {
  items: ReceiptItem[];
}

interface VatBucket {
  rate: number;
  net: number;
  vat: number;
  gross: number;
}

function formatEur(n: number): string {
  return `€${n.toFixed(2)}`;
}

function vatLabel(rate: number): string {
  if (rate === 0) return "0%";
  if (rate === 0.07) return "7%";
  return "19%";
}

export function VatSplitCard({ items }: VatSplitCardProps) {
  const buckets = new Map<number, VatBucket>();

  for (const item of items) {
    if (item.total_price < 0) continue; // skip returns/discounts in summary

    const rate = item.vat_rate;
    const gross = item.total_price;
    const vatAmt = item.vat_amount ?? Math.round(gross * (rate / (1 + rate)) * 100) / 100;
    const net = Math.round((gross - vatAmt) * 100) / 100;

    const existing = buckets.get(rate) ?? { rate, net: 0, vat: 0, gross: 0 };
    buckets.set(rate, {
      rate,
      net: Math.round((existing.net + net) * 100) / 100,
      vat: Math.round((existing.vat + vatAmt) * 100) / 100,
      gross: Math.round((existing.gross + gross) * 100) / 100,
    });
  }

  const rows = Array.from(buckets.values()).sort((a, b) => b.rate - a.rate);
  const totals = rows.reduce(
    (acc, r) => ({
      net: Math.round((acc.net + r.net) * 100) / 100,
      vat: Math.round((acc.vat + r.vat) * 100) / 100,
      gross: Math.round((acc.gross + r.gross) * 100) / 100,
    }),
    { net: 0, vat: 0, gross: 0 }
  );

  const hasReturns = items.some((i) => i.total_price < 0);
  const returnsTotal = items
    .filter((i) => i.total_price < 0)
    .reduce((acc, i) => Math.round((acc + i.total_price) * 100) / 100, 0);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
      <h3 className="mb-3 font-semibold text-gray-700">VAT Breakdown</h3>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
            <th className="pb-1 text-left">Rate</th>
            <th className="pb-1 text-right">Net</th>
            <th className="pb-1 text-right">VAT</th>
            <th className="pb-1 text-right">Gross</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rate} className="border-b border-gray-100">
              <td className="py-1">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                    r.rate === 0.19
                      ? "bg-orange-100 text-orange-700"
                      : r.rate === 0.07
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {vatLabel(r.rate)}
                </span>
              </td>
              <td className="py-1 text-right text-gray-700">{formatEur(r.net)}</td>
              <td className="py-1 text-right text-gray-700">{formatEur(r.vat)}</td>
              <td className="py-1 text-right font-medium">{formatEur(r.gross)}</td>
            </tr>
          ))}
          {hasReturns && (
            <tr className="border-b border-gray-100 text-red-600">
              <td className="py-1 text-xs italic" colSpan={3}>
                Returns / Discounts
              </td>
              <td className="py-1 text-right font-medium">{formatEur(returnsTotal)}</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td className="pt-2 text-gray-700">Total</td>
            <td className="pt-2 text-right">{formatEur(totals.net)}</td>
            <td className="pt-2 text-right">{formatEur(totals.vat)}</td>
            <td className="pt-2 text-right">{formatEur(totals.gross + (hasReturns ? returnsTotal : 0))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
