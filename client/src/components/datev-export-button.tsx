import { Download } from "lucide-react";
import { useState } from "react";
import { api } from "#/lib/api";

interface DatevExportButtonProps {
  from?: string;
  to?: string;
}

export function DatevExportButton({ from, to }: DatevExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = (format: "datev" | "csv") => {
    setExporting(true);
    const url = api.getAccountingExportUrl(format, { from, to });
    const a = document.createElement("a");
    a.href = url;
    a.click();
    setTimeout(() => setExporting(false), 1000);
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleExport("datev")}
        disabled={exporting}
        className="flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        DATEV Export
      </button>
      <button
        onClick={() => handleExport("csv")}
        disabled={exporting}
        className="flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        CSV Export
      </button>
    </div>
  );
}
