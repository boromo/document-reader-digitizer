import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  RefreshCw,
  AlertTriangle,
  FileText,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
} from "lucide-react";
import { api } from "#/lib/api";
import type { AccountingRecordDetail } from "#/types/models";
import { LegalDisclaimerBanner } from "#/components/legal-disclaimer-banner";
import { FieldIssuesList } from "#/components/field-issues-list";
import { VatSummaryCard } from "#/components/vat-summary-card";
import { SkrAccountBadge } from "#/components/skr-account-badge";
import { AccountingFieldEditor } from "#/components/accounting-field-editor";
import { ReceiptItemsTab } from "#/components/receipt-items-tab";

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

export function AccountingReviewPage() {
  const { documentId } = useParams<{ documentId: string }>();

  const [record, setRecord] = useState<AccountingRecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "items">("details");

  const docId = parseInt(documentId ?? "", 10);

  const reload = () => {
    if (isNaN(docId)) return;
    setLoading(true);
    api
      .getAccountingRecord(docId)
      .then(setRecord)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isNaN(docId)) {
      setError("Invalid document ID");
      setLoading(false);
      return;
    }
    reload();
  }, [docId]);

  const handleConfirm = async () => {
    if (!record) return;
    setSaving("confirm");
    try {
      await api.confirmAccountingRecord(docId);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setSaving(null);
    }
  };

  const handleReprocess = async () => {
    if (!record) return;
    setSaving("reprocess");
    try {
      await api.reprocessAccountingRecord(docId);
      setTimeout(() => {
        setSaving(null);
        reload();
      }, 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reprocess"
      );
      setSaving(null);
    }
  };

  if (loading)
    return <div className="py-8 text-center text-gray-500">Loading…</div>;
  if (error)
    return (
      <div className="space-y-4">
        <Link
          to="/accounting"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  if (!record)
    return (
      <div className="py-8 text-center text-gray-500">
        No accounting record found.{" "}
        <Link to="/accounting" className="text-blue-600 hover:underline">
          Back to overview
        </Link>
      </div>
    );

  const hasVatIssues = record.issues.some(
    (i) => i.issue_type === "vat_mismatch" && !i.resolved
  );
  const errorCount = record.issues.filter(
    (i) => i.severity === "error" && !i.resolved
  ).length;
  const isConfirmed = record.accounting_status === "confirmed";

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex items-center justify-between">
        <Link
          to="/accounting"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Accounting Overview
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReprocess}
            disabled={saving !== null}
            className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${saving === "reprocess" ? "animate-spin" : ""}`}
            />
            Re-analyze
          </button>
          {!isConfirmed && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving !== null || errorCount > 0}
              title={
                errorCount > 0
                  ? "Errors must be resolved first"
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Confirm Document
            </button>
          )}
          {isConfirmed && (
            <span className="inline-flex items-center gap-1.5 rounded bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
              <Check className="h-4 w-4" />
              Confirmed
            </span>
          )}
        </div>
      </div>

      {/* Legal disclaimer */}
      <LegalDisclaimerBanner />

      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {BELEGART_LABELS[record.belegart] ?? record.belegart}
          {record.rechnungsnummer && (
            <span className="ml-2 text-base font-normal text-gray-500">
              #{record.rechnungsnummer}
            </span>
          )}
        </h1>
        <p className="text-sm text-gray-500">
          Document ID {record.document_id}
          {record.rechnungsdatum && ` · ${record.rechnungsdatum}`}
        </p>
      </div>

      {/* Tab bar — "Items" tab only shown for receipts */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab("details")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "details"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Fields & Issues
        </button>
        {record.belegart === "quittung" && (
          <button
            type="button"
            onClick={() => setActiveTab("items")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium ${
              activeTab === "items"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <ShoppingCart className="h-4 w-4" />
            Line Items
          </button>
        )}
      </div>

      {/* Items tab panel */}
      {activeTab === "items" && record.belegart === "quittung" && (
        <ReceiptItemsTab documentId={record.document_id} />
      )}

      {/* Details tab panel */}
      {activeTab === "details" && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left: original document viewer */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Original Document
          </h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            <iframe
              src={api.getOriginalUrl(record.document_id)}
              className="h-[600px] w-full"
              title="Original document"
            />
          </div>
          <Link
            to={`/documents/${record.document_id}`}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <FileText className="h-3.5 w-3.5" />
            Open general document view
          </Link>
        </div>

        {/* Right: accounting panel */}
        <div className="space-y-4">
          {/* Zusammenfassung */}
          {record.zusammenfassung && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">
                AI Summary
              </h2>
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                {record.zusammenfassung}
              </pre>
            </div>
          )}

          {/* VAT summary */}
          <VatSummaryCard
            netto={record.netto_betrag}
            ustSatz={record.ust_satz}
            ustBetrag={record.ust_betrag}
            brutto={record.brutto_betrag}
            zahlungsstatus={record.zahlungsstatus}
            hasVatIssues={hasVatIssues}
          />

          {/* SKR account */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">
              Booking Category (SKR03)
            </h2>
            <SkrAccountBadge
              konto={record.skr_konto}
              name={record.skr_konto_name}
              confidence={record.skr_confidence}
            />
          </div>

          {/* Issues */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">
              Quality Checks
              {record.issues.length > 0 && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-normal text-red-700">
                  {errorCount} errors
                </span>
              )}
            </h2>
            <FieldIssuesList issues={record.issues} />
          </div>

          {/* Offene Fragen */}
          {record.offene_fragen.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Open Questions
              </h2>
              <ul className="space-y-1">
                {record.offene_fragen.map((q, i) => (
                  <li key={i} className="text-sm text-amber-800">
                    • {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Field editor (collapsible) */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setShowEditor((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Edit Fields Manually
              {showEditor ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showEditor && (
              <div className="border-t border-gray-100 p-4">
                <AccountingFieldEditor
                  record={record}
                  onSaved={() => {
                    setShowEditor(false);
                    reload();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
