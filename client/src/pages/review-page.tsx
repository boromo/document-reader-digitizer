import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  X,
  Pencil,
  Save,
  FileText,
  Brain,
  BarChart3,
} from "lucide-react";
import { api } from "#/lib/api";
import { StatusBadge } from "#/components/status-badge";
import { TagBadge } from "#/components/tag-badge";
import { TagInput } from "#/components/tag-input";
import type {
  DocumentWithDetails,
  DocumentType,
  ExtractedField,
  Tag,
} from "#/types/models";

export function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentWithDetails | null>(null);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingType, setEditingType] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [editingFields, setEditingFields] = useState<Map<number, string>>(
    new Map()
  );
  const [savingAction, setSavingAction] = useState<string | null>(null);

  // Tag editing state
  const [editingTags, setEditingTags] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (!id) return;
    const docId = parseInt(id, 10);
    if (isNaN(docId)) {
      setError("Invalid document ID");
      setLoading(false);
      return;
    }

    Promise.all([api.getDocument(docId), api.getDocumentTypes()])
      .then(([docData, typesData]) => {
        setDoc(docData);
        setTypes(typesData);
        setSelectedType(
          docData.classification?.confirmed_type ||
            docData.classification?.ai_suggested_type ||
            ""
        );
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load document")
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (doc && Array.isArray((doc as any).tags)) {
      setTags((doc as any).tags);
    }
  }, [doc]);

  const reload = async () => {
    if (!id) return;
    const docData = await api.getDocument(parseInt(id, 10));
    setDoc(docData);
    setSelectedType(
      docData.classification?.confirmed_type ||
        docData.classification?.ai_suggested_type ||
        ""
    );
    setEditingFields(new Map());
    setEditingType(false);
  };

  const handleConfirm = async () => {
    if (!doc) return;
    setSavingAction("confirm");
    try {
      // Save any pending field edits first
      if (editingFields.size > 0) {
        await api.updateFields(
          doc.id,
          Array.from(editingFields.entries()).map(([fieldId, value]) => ({
            id: fieldId,
            confirmed_value: value,
          }))
        );
      }
      // Save type if changed
      if (editingType && selectedType) {
        await api.classifyDocument(doc.id, selectedType);
      }
      await api.confirmDocument(doc.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setSavingAction(null);
    }
  };

  const handleSaveFields = async () => {
    if (!doc || editingFields.size === 0) return;
    setSavingAction("fields");
    try {
      await api.updateFields(
        doc.id,
        Array.from(editingFields.entries()).map(([fieldId, value]) => ({
          id: fieldId,
          confirmed_value: value,
        }))
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingAction(null);
    }
  };

  const handleSaveType = async () => {
    if (!doc || !selectedType) return;
    setSavingAction("type");
    try {
      await api.classifyDocument(doc.id, selectedType);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingAction(null);
    }
  };

  const handleSaveTags = async () => {
    if (!doc) return;
    setSavingAction("tags");
    try {
      console.log(tags);
      await api.setDocumentTags(doc.id, tags.map((t) => t.id));
      await reload();
      setEditingTags(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tags");
    } finally {
      setSavingAction(null);
    }
  };

  const toggleFieldEdit = (field: ExtractedField) => {
    const current = editingFields.has(field.id);
    const newMap = new Map(editingFields);
    if (current) {
      newMap.delete(field.id);
    } else {
      newMap.set(
        field.id,
        field.confirmed_value || field.ai_suggested_value || ""
      );
    }
    setEditingFields(newMap);
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Loading document...
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || "Document not found"}</p>
        <Link to="/documents" className="text-blue-600 hover:underline text-sm">
          Back to documents
        </Link>
      </div>
    );
  }

  const classification = doc.classification;
  const extracted = doc.extracted_data;
  const confidence = classification?.ai_confidence
    ? Math.round(classification.ai_confidence * 100)
    : null;
  const ocrConfidence = extracted?.ocr_confidence
    ? Math.round(extracted.ocr_confidence)
    : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/documents")}
            className="p-1.5 rounded-md hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold truncate max-w-md">
              {doc.original_filename}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={doc.status} />
              {doc.processing_job && (
                <StatusBadge status={doc.processing_job.status} />
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {(doc.status === "review" || doc.status === "pending") && (
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={savingAction !== null}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
            >
              <Check className="h-4 w-4 mr-1.5" />
              {savingAction === "confirm" ? "Confirming..." : "Confirm"}
            </button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {doc.processing_job?.error_message && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800">Processing Error</p>
          <p className="text-sm text-red-700 mt-1">
            {doc.processing_job.error_message}
          </p>
        </div>
      )}

      {/* Side-by-side view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Original document */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Original Document
            </h2>
          </div>
          <div className="bg-gray-100 flex items-center justify-center min-h-[500px]">
            {doc.mime_type === "application/pdf" ? (
              <iframe
                src={api.getOriginalUrl(doc.id)}
                className="w-full h-[600px]"
                title="Document preview"
              />
            ) : (
              <img
                src={api.getOriginalUrl(doc.id)}
                alt={doc.original_filename}
                className="max-w-full max-h-[600px] object-contain"
              />
            )}
          </div>
        </div>

        {/* Right: Extracted data */}
        <div className="space-y-4">
          {/* Classification */}
          <div className="border rounded-lg">
            <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Classification
              </h2>
              {confidence !== null && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    confidence >= 80
                      ? "bg-green-100 text-green-700"
                      : confidence >= 50
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {confidence}% confidence
                </span>
              )}
            </div>
            <div className="p-4">
              {editingType ? (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="flex-1 border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Select type...</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleSaveType}
                    disabled={savingAction !== null}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                  >
                    <Save className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingType(false);
                      setSelectedType(
                        classification?.confirmed_type ||
                          classification?.ai_suggested_type ||
                          ""
                      );
                    }}
                    className="p-1.5 text-gray-400 hover:bg-gray-50 rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {(
                        classification?.confirmed_type ||
                        classification?.ai_suggested_type ||
                        "Unknown"
                      ).replace(/_/g, " ")}
                    </p>
                    {classification?.confirmed_type &&
                      classification.confirmed_type !==
                        classification.ai_suggested_type && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          AI suggested:{" "}
                          {classification.ai_suggested_type?.replace(/_/g, " ")}
                        </p>
                      )}
                  </div>
                  {doc.status !== "confirmed" && (
                    <button
                      onClick={() => setEditingType(true)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Summary + Sentiment */}
          {extracted && (extracted.summary || extracted.sentiment) && (
            <div className="border rounded-lg">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Analysis
                </h2>
              </div>
              <div className="p-4 space-y-3">
                {extracted.summary && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                      Summary
                    </p>
                    <p className="text-sm text-gray-800">{extracted.summary}</p>
                  </div>
                )}
                {extracted.sentiment && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                      Sentiment
                    </p>
                    <p className="text-sm text-gray-800">
                      {extracted.sentiment}
                    </p>
                  </div>
                )}
                {ocrConfidence !== null && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                      OCR Confidence
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            ocrConfidence >= 80
                              ? "bg-green-500"
                              : ocrConfidence >= 50
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${ocrConfidence}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600">
                        {ocrConfidence}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Extracted Fields */}
          {doc.extracted_fields.length > 0 && (
            <div className="border rounded-lg">
              <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-700">
                  Extracted Fields
                </h2>
                {editingFields.size > 0 && (
                  <button
                    onClick={handleSaveFields}
                    disabled={savingAction !== null}
                    className="inline-flex items-center text-xs px-2.5 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    <Save className="h-3 w-3 mr-1" />
                    {savingAction === "fields" ? "Saving..." : "Save edits"}
                  </button>
                )}
              </div>
              <div className="divide-y">
                {doc.extracted_fields.map((field) => {
                  const isEditing = editingFields.has(field.id);
                  const displayValue =
                    field.confirmed_value ||
                    field.ai_suggested_value ||
                    field.field_value ||
                    "—";

                  return (
                    <div
                      key={field.id}
                      className="px-4 py-3 flex items-start justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-500 uppercase">
                          {field.field_name.replace(/_/g, " ")}
                        </p>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingFields.get(field.id) || ""}
                            onChange={(e) => {
                              const newMap = new Map(editingFields);
                              newMap.set(field.id, e.target.value);
                              setEditingFields(newMap);
                            }}
                            className="mt-1 w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                            autoFocus
                          />
                        ) : (
                          <p className="text-sm text-gray-800 mt-0.5">
                            {displayValue}
                          </p>
                        )}
                        {field.confidence !== null && !isEditing && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {Math.round(field.confidence * 100)}% confidence
                          </p>
                        )}
                      </div>
                      {doc.status !== "confirmed" && (
                        <button
                          onClick={() => toggleFieldEdit(field)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded mt-1"
                        >
                          {isEditing ? (
                            <X className="h-3.5 w-3.5" />
                          ) : (
                            <Pencil className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tags */}
          <div className="border rounded-lg">
            <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-blue-400 rounded-full mr-2" />
                Tags
              </h2>
              {editingTags ? (
                <button
                  onClick={handleSaveTags}
                  disabled={savingAction !== null}
                  className="inline-flex items-center text-xs px-2.5 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {savingAction === "tags" ? "Saving..." : "Save"}
                </button>
              ) : (
                <button
                  onClick={() => setEditingTags(true)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="p-4">
              {editingTags ? (
                <TagInput value={tags} onChange={setTags} />
              ) : tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <TagBadge key={tag.id} tag={tag} />
                  ))}
                </div>
              ) : (
                <span className="text-xs text-gray-400">No tags</span>
              )}
            </div>
          </div>

          {/* Raw OCR Text */}
          {extracted?.raw_text && (
            <details className="border rounded-lg">
              <summary className="bg-gray-50 px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-100">
                Raw OCR Text
              </summary>
              <div className="p-4">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 rounded p-3 max-h-64 overflow-auto">
                  {extracted.raw_text}
                </pre>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
