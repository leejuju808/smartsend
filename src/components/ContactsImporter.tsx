"use client";
import { useRef, useState, useCallback } from "react";
import { Upload, X, FileText, CheckCircle, AlertCircle, Info, Download } from "lucide-react";

type ImportSummary = {
  total_in_file: number;
  valid_emails: number;
  invalid_emails: number;
  unique_after_dedup: number;
  existing_skipped: number;
  suppressed_skipped: number;
  inserted: number;
};

export default function ContactsImporter({ onImported }: { onImported?: (r: ImportSummary) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [addingTag, setAddingTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "text/csv" || file.name.endsWith('.csv')) {
        setFileName(file.name);
        if (fileRef.current) {
          fileRef.current.files = e.dataTransfer.files;
        }
      } else {
        setError("Please select a CSV file");
      }
    }
  }, []);

  async function importCsv() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please select a CSV file");
      return;
    }

    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError("Please select a valid CSV file");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (addingTag.trim()) {
        formData.append("addTag", addingTag.trim());
      }

      const response = await fetch("/api/contacts/import-enhanced", { 
        method: "POST", 
        body: formData 
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Import failed");
      }

      const data = await response.json();
      setResult(data);
      onImported?.(data);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setFileName("");
    setAddingTag("");
    setResult(null);
    setError(null);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border p-6 space-y-6 bg-white">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Upload className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Import Contacts</h3>
          <p className="text-sm text-gray-600">Upload a CSV file with your contacts</p>
        </div>
      </div>

      {/* Download Template */}
      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900 mb-1">Need a template?</h4>
            <p className="text-sm text-gray-600">Download our CSV template to see the expected format</p>
          </div>
          <a
            href="/contacts_template.csv"
            download
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download Template
          </a>
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragActive 
            ? "border-blue-400 bg-blue-50" 
            : "border-gray-300 hover:border-gray-400"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setFileName(file.name);
              setError(null);
            }
          }}
        />
        
        {!fileName ? (
          <div className="space-y-3">
            <Upload className="h-12 w-12 text-gray-400 mx-auto" />
            <div>
              <p className="text-lg font-medium text-gray-900">
                Drop your CSV file here, or{" "}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-blue-600 hover:text-blue-500 font-medium"
                >
                  browse
                </button>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Supports CSV files with email, first_name, last_name, company columns
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <FileText className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <p className="text-lg font-medium text-gray-900">{fileName}</p>
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-gray-500 hover:text-gray-700 mt-1"
              >
                Choose different file
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tag Input */}
      {fileName && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Add tag to all contacts (optional)
          </label>
          <input
            value={addingTag}
            onChange={(e) => setAddingTag(e.target.value)}
            placeholder="e.g., leads, trial, imported-2025"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Import Button */}
      {fileName && (
        <button
          disabled={busy}
          onClick={importCsv}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? (
            <div className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Importing...
            </div>
          ) : (
            "Import Contacts"
          )}
        </button>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-lg border border-gray-200 p-6 bg-gray-50">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <h4 className="text-lg font-semibold text-gray-900">Import Complete!</h4>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-green-600">{result.inserted}</div>
              <div className="text-sm text-gray-600">Successfully Imported</div>
            </div>
            
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-blue-600">{result.total_in_file}</div>
              <div className="text-sm text-gray-600">Total in File</div>
            </div>
            
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-orange-600">{result.unique_after_dedup}</div>
              <div className="text-sm text-gray-600">Unique Emails</div>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-gray-600">
            {result.existing_skipped > 0 && (
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-500" />
                <span>{result.existing_skipped} emails already existed and were skipped</span>
              </div>
            )}
            {result.suppressed_skipped > 0 && (
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-orange-500" />
                <span>{result.suppressed_skipped} emails were suppressed and skipped</span>
              </div>
            )}
            {result.invalid_emails > 0 && (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span>{result.invalid_emails} emails were invalid and skipped</span>
              </div>
            )}
          </div>

          <button
            onClick={resetForm}
            className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}

