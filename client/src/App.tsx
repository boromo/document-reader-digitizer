import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { FileText, Upload, Activity, LayoutDashboard, BookOpen } from "lucide-react";
import { UploadPage } from "#/pages/upload-page";
import { DocumentsPage } from "#/pages/documents-page";
import { ReviewPage } from "#/pages/review-page";
import { DashboardPage } from "#/pages/dashboard-page";
import { AccountingDashboardPage } from "#/pages/accounting-dashboard-page";
import { AccountingReviewPage } from "#/pages/accounting-review-page";
import { VatReportPage } from "#/pages/vat-report-page";
import { OpenItemsPage } from "#/pages/open-items-page";
import { BankTransactionsPage } from "#/pages/bank-transactions-page";
import { useEffect, useState } from "react";
import { api } from "#/lib/api";
import type { QueueStats } from "#/types/models";

function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [stats, setStats] = useState<QueueStats | null>(null);

  useEffect(() => {
    const fetchStats = () => {
      api.getQueueStats().then(setStats).catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const processing = (stats?.pending ?? 0) + (stats?.processing ?? 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <NavLink to="/" className="text-lg font-bold text-gray-900">
              DocReader
            </NavLink>
            <div className="flex items-center gap-1">
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </NavLink>
              <NavLink
                to="/documents"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                <FileText className="h-4 w-4" />
                Documents
              </NavLink>
              <NavLink
                to="/upload"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                <Upload className="h-4 w-4" />
                Upload
              </NavLink>
              <NavLink
                to="/accounting"
                end
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                <BookOpen className="h-4 w-4" />
                Accounting
              </NavLink>
              <NavLink
                to="/accounting/vat-report"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                VAT Report
              </NavLink>
              <NavLink
                to="/accounting/open-items"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                Open Items
              </NavLink>
              <NavLink
                to="/bank-transactions"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                Bank Transactions
              </NavLink>
              {processing > 0 && (
                <span className="flex items-center gap-1 ml-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                  <Activity className="h-3 w-3 animate-pulse" />
                  {processing} processing
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/:id" element={<ReviewPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/accounting" element={<AccountingDashboardPage />} />
          <Route path="/accounting/vat-report" element={<VatReportPage />} />
          <Route path="/accounting/open-items" element={<OpenItemsPage />} />
          <Route path="/accounting/:documentId" element={<AccountingReviewPage />} />
          <Route path="/bank-transactions" element={<BankTransactionsPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
