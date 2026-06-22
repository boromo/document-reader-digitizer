import { useEffect, useState } from "react";
import {
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  HardDrive,
  BarChart3,
  Download,
} from "lucide-react";
import { api } from "#/lib/api";
import type { DashboardSummary } from "#/types/models";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white border rounded-lg p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function BarChart({
  data,
  title,
}: {
  data: Array<{ label: string; value: number }>;
  title: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bg-white border rounded-lg p-5">
      <h3 className="text-sm font-medium text-gray-700 mb-4">{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">No data</p>
      ) : (
        <div className="space-y-2.5">
          {data.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-24 truncate text-right">
                {item.label}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div
                  className="bg-gray-800 h-5 rounded-full transition-all flex items-center justify-end pr-2"
                  style={{
                    width: `${Math.max((item.value / max) * 100, 8)}%`,
                  }}
                >
                  <span className="text-[10px] text-white font-medium">
                    {item.value}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadTimeline({
  data,
}: {
  data: Array<{ date: string; count: number }>;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const barWidth = Math.max(4, Math.floor(100 / Math.max(data.length, 1)));

  return (
    <div className="bg-white border rounded-lg p-5">
      <h3 className="text-sm font-medium text-gray-700 mb-4">
        Uploads (Last 30 Days)
      </h3>
      <div className="flex items-end gap-[2px] h-32">
        {data.map((day) => (
          <div
            key={day.date}
            className="bg-blue-500 rounded-t-sm hover:bg-blue-600 transition-colors group relative"
            style={{
              height: `${(day.count / max) * 100}%`,
              width: `${barWidth}%`,
              minHeight: "4px",
            }}
          >
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
              {day.date}: {day.count}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-gray-400">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDashboardSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Loading dashboard...
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-12 text-gray-500">
        Failed to load dashboard data.
      </div>
    );
  }

  const statusData = Object.entries(summary.byStatus).map(([label, value]) => ({
    label,
    value,
  }));

  const typeData = Object.entries(summary.byType).map(([label, value]) => ({
    label: label.replace(/_/g, " "),
    value,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <a
            href={api.getExportUrl("csv")}
            className="inline-flex items-center px-3 py-1.5 bg-white border rounded-md text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV
          </a>
          <a
            href={api.getExportUrl("json")}
            className="inline-flex items-center px-3 py-1.5 bg-white border rounded-md text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            JSON
          </a>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Documents"
          value={summary.totalDocuments}
          icon={FileText}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          label="Confirmed"
          value={summary.byStatus.confirmed ?? 0}
          icon={CheckCircle}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          label="Pending Review"
          value={summary.byStatus.review ?? 0}
          icon={Clock}
          color="bg-purple-100 text-purple-600"
        />
        <StatCard
          label="Avg OCR Confidence"
          value={
            summary.avgOcrConfidence
              ? `${summary.avgOcrConfidence}%`
              : "—"
          }
          icon={BarChart3}
          color="bg-amber-100 text-amber-600"
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Processing"
          value={
            (summary.byStatus.pending ?? 0) +
            (summary.byStatus.processing ?? 0)
          }
          icon={AlertTriangle}
          color="bg-yellow-100 text-yellow-600"
        />
        <StatCard
          label="Failed Jobs"
          value={summary.processingStats.failed ?? 0}
          icon={AlertTriangle}
          color="bg-red-100 text-red-600"
        />
        <StatCard
          label="Storage Used"
          value={formatBytes(summary.totalStorageBytes)}
          icon={HardDrive}
          color="bg-gray-100 text-gray-600"
        />
        <StatCard
          label="Document Types"
          value={Object.keys(summary.byType).length}
          icon={FileText}
          color="bg-indigo-100 text-indigo-600"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <BarChart title="By Status" data={statusData} />
        <BarChart title="By Type" data={typeData} />
      </div>

      {/* Upload timeline */}
      <UploadTimeline data={summary.recentUploads} />
    </div>
  );
}
