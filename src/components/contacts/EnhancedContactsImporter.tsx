"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, X, FileText, Download, AlertCircle } from "lucide-react";
import Papa from "papaparse";
import ValidationTable from "./ValidationTable";
import BulkFixTools from "./BulkFixTools";
import ImportPreview from "./ImportPreview";
import { ContactCSVRow, ValidationResult, ValidatedContact } from "@/lib/validation/contact-validator";

type ImportSummary = {
  total_rows: number;
  valid: number;
  invalid: number;
  warnings: number;
  duplicates: number;
  inserted: number;
};

type Step = "upload" | "validate" | "preview" | "complete";

export default function EnhancedContactsImporter({ 
  onImported 
}: { 
  onImported?: (r: ImportSummary) => void 
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [csvRows, setCsvRows] = useState<ContactCSVRow[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [dragActive, setDragActive] = useState(false);

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
        handleFile(file);
      } else {
        setError("Please select a CSV file");
      }
    }
  }, []);

  async function handleFile(file: File) {
    setFileName(file.name);
    setError(null);
    setBusy(true);

    try {
      const text = await file.text();
      const parseResult = Papa.parse<ContactCSVRow>(text, {
        header: true,
        skipEmptyLines: true,
        trimHeaders: true,
        transformHeader: (header) => header.trim(),
      });
      
      if (parseResult.errors.length > 0) {
        console.warn("CSV parsing warnings:", parseResult.errors);
      }
      
      const rows = parseResult.data;

      if (rows.length === 0) {
        throw new Error("CSV file is empty");
      }

      // Guardrail: Hard limit
      if (rows.length > 25000) {
        throw new Error("Upload exceeds maximum of 25,000 contacts. Please split your file.");
      }

      setCsvRows(rows);
      
      // Automatically validate
      await validateRows(rows);
    } catch (err: any) {
      setError(err.message || "Failed to parse CSV file");
      setBusy(false);
    }
  }

  async function validateRows(rows: ContactCSVRow[]) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/contacts/validate-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, checkMX: false }), // Skip MX check for speed
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Validation failed");
      }

      const data = await response.json();
      setValidationResult(data);
      setStep("validate");
    } catch (err: any) {
      setError(err.message || "Validation failed");
    } finally {
      setBusy(false);
    }
  }

  function handleBulkFix(fixedRows: ContactCSVRow[]) {
    setCsvRows(fixedRows);
    validateRows(fixedRows);
  }

  function handleSkipErrors() {
    if (!validationResult) return;
    
    const validRows = validationResult.results
      .filter(r => r.valid)
      .map(r => r.cleaned);
    
    setCsvRows(validRows);
    validateRows(validRows);
  }

  function handleOverwriteDuplicates() {
    setStep("preview");
  }

  async function handleImportValid() {
    if (!validationResult) return;

    setBusy(true);
    setError(null);

    try {
      const validRows = validationResult.results
        .filter(r => r.valid)
        .map(r => r.cleaned);

      const response = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: validRows,
          options: {
            skipWarnings: false,
            overwriteDuplicates: false,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Import failed");
      }

      const data = await response.json();
      setImportResult(data.summary);
      setStep("complete");
      onImported?.(data.summary);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportAll() {
    if (!validationResult) return;

    setBusy(true);
    setError(null);

    try {
      const allRows = validationResult.results.map(r => r.cleaned);

      const response = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: allRows,
          options: {
            skipWarnings: false,
            overwriteDuplicates: true,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Import failed");
      }

      const data = await response.json();
      setImportResult(data.summary);
      setStep("complete");
      onImported?.(data.summary);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setStep("upload");
    setFileName("");
    setCsvRows([]);
    setValidationResult(null);
    setImportResult(null);
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
          <p className="text-sm text-gray-600">
            Upload a CSV file with your contacts. SmartSend will validate and clean them automatically.
          </p>
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <>
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
                  handleFile(file);
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

          {busy && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                Processing CSV...
              </div>
            </div>
          )}
        </>
      )}

      {/* Step 2: Validation Table */}
      {step === "validate" && validationResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Validation Results</h3>
            <button
              onClick={resetForm}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Upload Different File
            </button>
          </div>

          <BulkFixTools rows={csvRows} onFixed={handleBulkFix} />

          <ValidationTable
            results={validationResult.results}
            onBulkFix={() => handleBulkFix(csvRows)}
            onSkipErrors={handleSkipErrors}
            onOverwriteDuplicates={handleOverwriteDuplicates}
          />

          <div className="flex gap-3">
            <button
              onClick={() => setStep("preview")}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Review & Import
            </button>
            <button
              onClick={resetForm}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Import Preview */}
      {step === "preview" && validationResult && (
        <div>
          <ImportPreview
            validationResult={validationResult}
            onImportValid={handleImportValid}
            onImportAll={handleImportAll}
            onCancel={() => setStep("validate")}
          />

          {busy && (
            <div className="mt-4 text-center py-4">
              <div className="inline-flex items-center gap-2 text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                Importing contacts...
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Complete */}
      {step === "complete" && importResult && (
        <div className="rounded-lg border border-gray-200 p-6 bg-gray-50">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-5 w-5 rounded-full bg-green-600 flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
            <h4 className="text-lg font-semibold text-gray-900">Import Complete!</h4>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-green-600">{importResult.inserted}</div>
              <div className="text-sm text-gray-600">Imported</div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-blue-600">{importResult.total_rows}</div>
              <div className="text-sm text-gray-600">Total Rows</div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-red-600">{importResult.invalid}</div>
              <div className="text-sm text-gray-600">Skipped</div>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-yellow-600">{importResult.warnings}</div>
              <div className="text-sm text-gray-600">Warnings</div>
            </div>
          </div>

          <button
            onClick={resetForm}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Import Another File
          </button>
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
    </div>
  );
}

