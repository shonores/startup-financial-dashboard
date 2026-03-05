"use client";

import { useState, DragEvent, ChangeEvent } from "react";
import NavBar from "@/components/NavBar";
import DashboardClient from "@/components/DashboardClient";
import type { DashboardData } from "@/lib/types";

const ACCEPTED_EXTS = [".csv", ".pdf", ".xlsx", ".xls"];

function acceptsFile(f: File) {
  return ACCEPTED_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext));
}

export default function AppShell() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function addFiles(incoming: FileList | File[]) {
    const valid = Array.from(incoming).filter(acceptsFile);
    if (valid.length === 0) {
      setError("Accepted formats: .csv · .pdf · .xlsx · .xls");
      return;
    }
    setError(null);
    setStagedFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...valid.filter((f) => !existingNames.has(f.name))];
    });
  }

  function removeFile(name: string) {
    setStagedFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function uploadAll() {
    if (stagedFiles.length === 0) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    for (const file of stagedFiles) formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json() as Record<string, unknown>;
      if (!res.ok || json.error) {
        setError((json.error as string) ?? "Upload failed");
        return;
      }
      setData(json as unknown as DashboardData);
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

  // ── Dashboard view ──────────────────────────────────────────────────────────
  if (data) {
    return (
      <div className="min-h-screen bg-slate-950">
        <NavBar />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <DashboardClient
            data={data}
            onUploadMore={() => { setData(null); setStagedFiles([]); }}
          />
        </main>
      </div>
    );
  }

  // ── Upload view ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100">
            Startup Runway Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Upload your bank statements — all processing happens in your browser session,
            nothing is saved to any server.
          </p>
        </div>

        {/* Privacy notice */}
        <div className="bg-blue-950 border border-blue-800 rounded-xl p-4 mb-6">
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">
            Privacy First
          </p>
          <p className="text-blue-200 text-sm">
            Files are parsed in memory and immediately discarded. Only anonymous monthly
            totals and anonymised vendor summaries are kept — in your browser session only.
            Nothing is stored in any database.
          </p>
        </div>

        {/* Drop zone */}
        {!uploading && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => document.getElementById("fileInput")?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer
              ${isDragging
                ? "border-blue-500 bg-blue-950/30"
                : "border-slate-700 hover:border-slate-500 bg-slate-900/50"
              }
            `}
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
              <p className="text-slate-200 font-medium">Drop bank statements here</p>
              <p className="text-slate-500 text-sm">or click to browse · multiple files supported</p>
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
              <p className="text-slate-300 font-medium">Processing in memory…</p>
              <p className="text-slate-500 text-sm">Parsing, merging accounts, aggregating</p>
            </div>
          </div>
        )}

        {/* Staged files */}
        {stagedFiles.length > 0 && !uploading && (
          <div className="mt-4 card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-200">
                Ready to upload ({stagedFiles.length} file{stagedFiles.length > 1 ? "s" : ""})
              </p>
              <button onClick={() => setStagedFiles([])} className="text-slate-500 hover:text-slate-300 text-xs">
                Clear all
              </button>
            </div>
            <div className="space-y-2 mb-4">
              {stagedFiles.map((f) => (
                <div key={f.name} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">📄</span>
                    <span className="text-slate-200 text-sm">{f.name}</span>
                    <span className="text-slate-500 text-xs">({(f.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button
                    onClick={() => removeFile(f.name)}
                    className="text-slate-600 hover:text-red-400 text-sm transition-colors ml-3"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={uploadAll} className="btn-primary flex-1">
                Analyse {stagedFiles.length > 1 ? `${stagedFiles.length} Files` : "File"}
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
      </main>
    </div>
  );
}
