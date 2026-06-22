import { AlertTriangle } from "lucide-react";

/**
 * Non-dismissible legal disclaimer banner required on all accounting views.
 */
export function LegalDisclaimerBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p>
        <strong>Notice:</strong> This accounting assistant helps prepare and organize bookkeeping data.
        It does not replace a licensed tax advisor (Steuerberater) and does not provide binding tax advice.
        For year-end closing, tax returns, tax optimization, and all legally binding decisions,
        please consult a qualified Steuerberater.
      </p>
    </div>
  );
}
