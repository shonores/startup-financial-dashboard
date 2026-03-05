"use client";

import NavBar from "@/components/NavBar";
import { useState, DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";

interface FileResult {
  name: string;
  processedRows: number;
  monthsCovered: string;
}

interface UploadSummary {
  filesProcessed: number;
  totalRowsInFiles: number;
  processedRows: number;
  fileResults: FileResult[];
  parseErrors?: string[];
  monthsInDashboard: number;
  vendorsTracked: number;
  latestMonth: string | null;
  latestClosingBalance: number | null;
  topVendorAlias: string | null;
}

interface UploadResponse {
  success?: boolean;
  error?: string;
  summary?: UploadSummary;
  privacyNote?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Staged files — shown before uploading
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const ACCEPTED_EXTS = [".csv", ".pdf", ".xlsx", ".xls"];

  function addFiles(incoming: FileList | File[]) {
    const csvFiles = Array.from(incoming).filter((f) =>
      ACCEPTED_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    if (csvFiles.length === 0) {
      setError("Please select .csv, .pdf, .xlsx, or .xls files");
      return;
    }
    setError(null);
    setStagedFiles((prev) => {
      // Deduplicate by name
      const existingNames = new Set(prev.map((f) => f.name));
      const newOnes = csvFiles.filter((f) => !existingNames.has(f.name));
      return [...prev, ...newOnes];
    });
  }

  function removeFile(name: string) {
    setStagedFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function uploadAll() {
    if (stagedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    // All files appended under the same "file" key — server uses getAll("file")
    for (const file of stagedFiles) {
      formData.append("file", file);
    }

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = (await res.json()) as UploadResponse;
      if (!res.ok || data.error) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setResult(data);
      setStagedFiles([]);
    } catch {
      setError("Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100">Upload CSV</h1>
          <p className="text-slate-400 text-sm mt-1">
            Upload one or more Revolut Business statements — all accounts are merged into a single dashboard view
          </p>
        </div>

        {/* Privacy notice */}
        <div className="bg-blue-950 border border-blue-800 rounded-xl p-4 mb-6">
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">
            Privacy First
          </p>
          <p className="text-blue-200 text-sm">
            All bank statements are parsed entirely in memory. No transaction data, payee names, IBANs, or
            individual amounts are ever written to disk. Only anonymous monthly totals and anonymized vendor
            summaries are stored.
          </p>
        </div>

        {/* Drop zone */}
        {!uploading && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`
              relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer
              ${isDragging
                ? "border-blue-500 bg-blue-950/30"
                : "border-slate-700 hover:border-slate-500 bg-slate-900/50"
              }
            `}
            onClick={() => document.getElementById("fileInput")?.click()}
          >
            <input
              id="fileInput"
              type="file"
              accept=".csv,.pdf,.xlsx,.xls"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
            <div className="space-y-2">
              <div className="text-4xl">📂</div>
              <p className="text-slate-200 font-medium">
                Drop bank statements here
              </p>
              <p className="text-slate-500 text-sm">
                or click to browse · multiple files supported
              </p>
              <p className="text-slate-600 text-xs pt-1">
                Revolut CSV · ABN AMRO PDF · N26 PDF · Excel (.xlsx / .xls)
              </p>
              <p className="text-slate-600 text-xs">
                Each file = one bank account · all merged automatically
              </p>
            </div>
          </div>
        )}

        {/* Uploading spinner */}
        {uploading && (
          <div className="border-2 border-slate-700 rounded-xl p-10 text-center">
            <div className="space-y-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-300 font-medium">Processing {stagedFiles.length > 0 ? `${stagedFiles.length} file${stagedFiles.length > 1 ? "s" : ""}` : "files"} in memory...</p>
              <p className="text-slate-500 text-sm">Parsing, merging accounts, and aggregating</p>
            </div>
          </div>
        )}

        {/* Staged file list */}
        {stagedFiles.length > 0 && !uploading && (
          <div className="mt-4 card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-200">
                Ready to upload ({stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""})
              </p>
              <button
                onClick={() => setStagedFiles([])}
                className="text-slate-500 hover:text-slate-300 text-xs"
              >
                Clear all
              </button>
            </div>
            <div className="space-y-2 mb-4">
              {stagedFiles.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">📄</span>
                    <span className="text-slate-200 text-sm">{f.name}</span>
                    <span className="text-slate-500 text-xs">
                      ({(f.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    onClick={() => removeFile(f.name)}
                    className="text-slate-600 hover:text-red-400 text-sm transition-colors ml-3"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={uploadAll} className="btn-primary flex-1">
                Upload {stagedFiles.length > 1 ? "All " + stagedFiles.length + " Files" : "File"}
              </button>
              <button
                onClick={() => document.getElementById("fileInput")?.click()}
                className="btn-ghost"
              >
                Add more
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-950 border border-red-900 rounded-xl p-4">
            <p className="text-red-400 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Success result */}
        {result?.success && result.summary && (
          <div className="mt-6 card">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-green-400 text-xl">✓</span>
              <h2 className="text-slate-100 font-semibold">Dashboard Updated</h2>
            </div>

            {/* Per-file results */}
            {result.summary.fileResults.length > 1 && (
              <div className="mb-4 space-y-1.5">
                {result.summary.fileResults.map((fr) => (
                  <div
                    key={fr.name}
                    className="flex items-center justify-between text-xs bg-slate-800 rounded-lg px-3 py-2"
                  >
                    <span className="text-slate-400">{fr.name}</span>
                    <span className="text-slate-300">
                      {fr.processedRows.toLocaleString()} rows · {fr.monthsCovered}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Parse errors (partial failures) */}
            {result.summary.parseErrors?.map((e) => (
              <div key={e} className="mb-3 bg-yellow-950 border border-yellow-900 rounded-lg px-3 py-2 text-xs text-yellow-400">
                ⚠ {e}
              </div>
            ))}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">
                  Accounts Merged
                </p>
                <p className="text-slate-100 font-bold tabular-nums">
                  {result.summary.filesProcessed}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">
                  Rows Processed
                </p>
                <p className="text-slate-100 font-bold tabular-nums">
                  {result.summary.processedRows.toLocaleString()}{" "}
                  <span className="text-slate-500 font-normal text-sm">
                    / {result.summary.totalRowsInFiles.toLocaleString()} total
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">
                  Months in Dashboard
                </p>
                <p className="text-slate-100 font-bold tabular-nums">
                  {result.summary.monthsInDashboard}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">
                  Vendors Tracked
                </p>
                <p className="text-slate-100 font-bold tabular-nums">
                  {result.summary.vendorsTracked}
                </p>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-3 mb-4">
              <p className="text-xs text-slate-400 italic">{result.privacyNote}</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => router.push("/")} className="btn-primary flex-1">
                View Dashboard
              </button>
              <button onClick={() => setResult(null)} className="btn-ghost flex-1">
                Upload More
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 text-slate-600 text-xs space-y-1">
          <p>
            <strong className="text-slate-500">Multi-account:</strong> Upload one file per bank
            account (Revolut CSV, ABN AMRO PDF, N26 PDF, or Excel). All accounts are merged before
            aggregation — the dashboard shows unified totals.
          </p>
          <p>
            <strong className="text-slate-500">Re-uploading:</strong> Each upload replaces all
            existing data. Export full history from each account every time.
          </p>
        </div>
      </main>
    </div>
  );
}
