import { clsx } from "clsx";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        {
          "bg-yellow-100 text-yellow-800": status === "pending",
          "bg-blue-100 text-blue-800": status === "processing",
          "bg-purple-100 text-purple-800": status === "review",
          "bg-green-100 text-green-800": status === "confirmed",
          "bg-red-100 text-red-800":
            status === "rejected" || status === "failed",
          "bg-gray-100 text-gray-800":
            status === "queued" || status === "running",
          "bg-emerald-100 text-emerald-800": status === "completed",
        }
      )}
    >
      {status}
    </span>
  );
}
