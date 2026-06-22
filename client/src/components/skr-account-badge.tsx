import { HelpCircle } from "lucide-react";

interface SkrAccountBadgeProps {
  konto: string | null;
  name: string | null;
  confidence: number | null;
}

export function SkrAccountBadge({ konto, name, confidence }: SkrAccountBadgeProps) {
  if (!konto) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm text-gray-500">
        <HelpCircle className="h-3.5 w-3.5" />
        No SKR03 account assigned
      </div>
    );
  }

  const isLowConfidence = confidence !== null && confidence < 0.5;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm ${
        isLowConfidence
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-blue-200 bg-blue-50 text-blue-800"
      }`}
    >
      <span className="font-mono font-semibold">{konto}</span>
      <span className="text-xs">–</span>
      <span>{name}</span>
      {isLowConfidence && (
        <span
          className="text-xs text-amber-600"
          title="Low confidence — please review"
        >
          ⚠ uncertain
        </span>
      )}
      {confidence !== null && (
        <span className="ml-1 text-xs opacity-60">
          ({(confidence * 100).toFixed(0)}%)
        </span>
      )}
    </div>
  );
}
