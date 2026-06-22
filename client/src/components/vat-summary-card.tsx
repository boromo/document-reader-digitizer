import type { Zahlungsstatus } from "#/types/models";
import { CheckCircle, Clock, AlertCircle, HelpCircle } from "lucide-react";

interface VatSummaryCardProps {
  netto: number | null;
  ustSatz: number | null;
  ustBetrag: number | null;
  brutto: number | null;
  zahlungsstatus: Zahlungsstatus;
  hasVatIssues: boolean;
}

const ZAHLUNG_CONFIG: Record<
  Zahlungsstatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  bezahlt: { label: "Paid", color: "text-green-700", icon: CheckCircle },
  offen: { label: "Open", color: "text-red-600", icon: Clock },
  teilweise_bezahlt: {
    label: "Partially Paid",
    color: "text-amber-600",
    icon: AlertCircle,
  },
  unbekannt: { label: "Unknown", color: "text-gray-500", icon: HelpCircle },
};

function formatEur(val: number | null): string {
  if (val === null) return "–";
  return `${val.toFixed(2)} EUR`;
}

function formatRate(val: number | null): string {
  if (val === null) return "–";
  return `${(val * 100).toFixed(0)} %`;
}

export function VatSummaryCard({
  netto,
  ustSatz,
  ustBetrag,
  brutto,
  zahlungsstatus,
  hasVatIssues,
}: VatSummaryCardProps) {
  const zahlungCfg = ZAHLUNG_CONFIG[zahlungsstatus];
  const ZahlungIcon = zahlungCfg.icon;

  return (
    <div
      className={`rounded-lg border p-4 ${
        hasVatIssues ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
      }`}
    >
      <h3 className="mb-3 text-sm font-semibold text-gray-700">
        Amount Summary
      </h3>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Net Amount</span>
          <span className="font-mono font-medium">{formatEur(netto)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">
            VAT ({formatRate(ustSatz)})
          </span>
          <span className="font-mono font-medium">{formatEur(ustBetrag)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-200 pt-1">
          <span className="font-medium text-gray-700">Gross Amount</span>
          <span className="font-mono font-bold">{formatEur(brutto)}</span>
        </div>
      </div>
      <div className={`mt-3 flex items-center gap-1.5 text-sm ${zahlungCfg.color}`}>
        <ZahlungIcon className="h-4 w-4" />
        {zahlungCfg.label}
      </div>
      {hasVatIssues && (
        <p className="mt-2 text-xs text-red-600">
          ⚠ VAT calculation mismatch — please review
        </p>
      )}
    </div>
  );
}
