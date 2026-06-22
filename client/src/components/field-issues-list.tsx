import type { IssueSeverity, IssueType } from "#/types/models";
import { AlertTriangle, AlertCircle, Info, X } from "lucide-react";

interface Issue {
  id: number;
  issue_type: IssueType;
  field_name: string | null;
  description: string;
  severity: IssueSeverity;
  resolved: number;
}

const SEVERITY_CONFIG: Record<
  IssueSeverity,
  { bg: string; border: string; text: string; icon: React.ElementType }
> = {
  error: {
    bg: "bg-red-50",
    border: "border-red-300",
    text: "text-red-900",
    icon: X,
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-900",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-300",
    text: "text-blue-900",
    icon: Info,
  },
};

const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  missing_field: "Missing Field",
  vat_mismatch: "VAT Mismatch",
  duplicate_suspected: "Duplicate Suspected",
  legal_warning: "Legal Notice",
  steuerberater_required: "Tax Advisor Required",
};

interface FieldIssuesListProps {
  issues: Issue[];
}

export function FieldIssuesList({ issues }: FieldIssuesListProps) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        <AlertCircle className="h-4 w-4" />
        No issues found
      </div>
    );
  }

  // Sort: errors first, then warnings, then info
  const sorted = [...issues].sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="space-y-2">
      {sorted.map((issue) => {
        const config = SEVERITY_CONFIG[issue.severity];
        const Icon = config.icon;

        return (
          <div
            key={issue.id}
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${config.bg} ${config.border} ${config.text}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {ISSUE_TYPE_LABELS[issue.issue_type]}
                </span>
                {issue.field_name && (
                  <code className="rounded bg-black/10 px-1 text-xs">
                    {issue.field_name}
                  </code>
                )}
              </div>
              <p className="mt-0.5 text-xs">{issue.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
