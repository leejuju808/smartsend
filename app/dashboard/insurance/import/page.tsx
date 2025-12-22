"use client";

// Block 222000 — SmartSend Insurance Scope Importer v1
// Insurance Import Page: Upload Xactimate PDF → Extract Line Items → Create Estimate

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Edit2, Trash2, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type InsuranceImport = {
  id: string;
  company_id: string;
  homeowner_id: string | null;
  file_url: string;
  file_name: string | null;
  status: "uploaded" | "parsing" | "parsed" | "converted" | "error";
  insurance_company: string | null;
  claim_number: string | null;
  total_scope_value: number | null;
  created_at: string;
};

type LineItem = {
  id: string;
  code: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  total: number;
  display_order: number;
};

export default function InsuranceImportPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [homeownerId, setHomeownerId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [importId, setImportId] = useState<string | null>(null);
  const [importData, setImportData] = useState<InsuranceImport | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "parsing" | "preview" | "success">("upload");
  const [editingItem, setEditingItem] = useState<LineItem | null>(null);

  // Load company ID on mount
  useEffect(() => {
    async function loadCompanyId() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get user's first roofing company
        const { data: companies } = await supabase
          .from("roofing_companies")
          .select("id")
          .eq("owner_id", user.id)
          .eq("is_active", true)
          .limit(1);

        if (companies && companies.length > 0) {
          setCompanyId(companies[0].id);
        }
      } catch (err) {
        console.error("Error loading company ID:", err);
      }
    }
    loadCompanyId();
  }, [supabase]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0 && files[0].type === "application/pdf") {
        await handleFile(files[0]);
      } else {
        setError("Please select a PDF file");
      }
    },
    []
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        await handleFile(files[0]);
      }
    },
    []
  );

  async function handleFile(file: File) {
    if (!companyId) {
      setError("Company ID not found. Please refresh the page.");
      return;
    }

    setLoading(true);
    setError(null);
    setFileName(file.name);

    try {
      // Step 1: Upload PDF
      const formData = new FormData();
      formData.append("file", file);
      formData.append("company_id", companyId);
      if (homeownerId) {
        formData.append("homeowner_id", homeownerId);
      }

      const uploadRes = await fetch("/api/insurance/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const uploadData = await uploadRes.json();
      setImportId(uploadData.import_id);
      setStep("parsing");

      // Step 2: Parse PDF
      const parseRes = await fetch("/api/insurance/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ import_id: uploadData.import_id }),
      });

      if (!parseRes.ok) {
        throw new Error("Failed to parse PDF");
      }

      // Step 3: Extract structured line items
      const structureRes = await fetch("/api/insurance/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ import_id: uploadData.import_id }),
      });

      if (!structureRes.ok) {
        const errorData = await structureRes.json();
        throw new Error(errorData.error || "Failed to extract line items");
      }

      const structureData = await structureRes.json();

      // Load import data and line items
      await loadImportData(uploadData.import_id);
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setStep("upload");
    } finally {
      setLoading(false);
    }
  }

  async function loadImportData(id: string) {
    try {
      // Load import
      const { data: importData, error: importError } = await supabase
        .from("insurance_imports")
        .select("*")
        .eq("id", id)
        .single();

      if (importError) throw importError;

      setImportData(importData);

      // Load line items
      const { data: items, error: itemsError } = await supabase
        .from("insurance_line_items")
        .select("*")
        .eq("import_id", id)
        .order("display_order", { ascending: true });

      if (itemsError) throw itemsError;

      setLineItems(items || []);
      setStep("preview");
    } catch (err: any) {
      setError(err.message || "Failed to load import data");
    }
  }

  async function handleConvertToEstimate() {
    if (!importId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/insurance/to-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          import_id: importId,
          homeowner_id: homeownerId 
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create estimate");
      }

      const data = await res.json();
      setStep("success");
      
      // Redirect to estimate after 2 seconds
      setTimeout(() => {
        router.push(`/dashboard/estimates/${data.estimate_id}`);
      }, 2000);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  function handleEditItem(item: LineItem) {
    setEditingItem(item);
  }

  function handleDeleteItem(itemId: string) {
    setLineItems(lineItems.filter((item) => item.id !== itemId));
  }

  function handleSaveEdit(updatedItem: LineItem) {
    setLineItems(
      lineItems.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
    setEditingItem(null);
  }

  const total = lineItems.reduce((sum, item) => sum + (item.total || 0), 0);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Insurance Scope Importer</h1>
        <p className="text-muted-foreground mt-2">
          Upload Xactimate PDF → Auto-extract line items → Create estimate in seconds
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {step === "upload" && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
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
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileSelect}
          />

          {!fileName ? (
            <div className="space-y-4">
              <Upload className="h-16 w-16 text-gray-400 mx-auto" />
              <div>
                <p className="text-lg font-medium text-gray-900">
                  Drop your Xactimate PDF here, or{" "}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-500 font-medium"
                  >
                    browse
                  </button>
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Upload insurance scope PDFs to automatically extract line items, codes, quantities, and pricing
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <FileText className="h-16 w-16 text-green-500 mx-auto" />
              <div>
                <p className="text-lg font-medium text-gray-900">{fileName}</p>
                <button
                  type="button"
                  onClick={() => {
                    setFileName("");
                    setImportId(null);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 mt-2"
                >
                  Choose different file
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "parsing" && (
        <div className="border rounded-xl p-12 text-center">
          <Loader2 className="h-12 w-12 text-blue-600 mx-auto animate-spin mb-4" />
          <p className="text-lg font-medium">Extracting line items from PDF...</p>
          <p className="text-sm text-gray-500 mt-2">
            Using AI to parse Xactimate codes, quantities, and pricing
          </p>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="text-green-800">
              Successfully extracted {lineItems.length} line items from insurance scope
            </p>
          </div>

          {importData && (
            <div className="grid grid-cols-2 gap-4">
              {importData.insurance_company && (
                <div>
                  <p className="text-sm text-gray-500">Insurance Company</p>
                  <p className="font-medium">{importData.insurance_company}</p>
                </div>
              )}
              {importData.claim_number && (
                <div>
                  <p className="text-sm text-gray-500">Claim Number</p>
                  <p className="font-medium">{importData.claim_number}</p>
                </div>
              )}
              {importData.total_scope_value && (
                <div>
                  <p className="text-sm text-gray-500">Total Scope Value</p>
                  <p className="font-medium">${importData.total_scope_value.toLocaleString()}</p>
                </div>
              )}
            </div>
          )}

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b">
              <h3 className="font-semibold">Line Items Preview</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono">{item.code || "-"}</td>
                      <td className="px-4 py-3 text-sm">{item.description}</td>
                      <td className="px-4 py-3 text-sm text-right">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        {item.unit_price ? `$${item.unit_price.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        ${item.total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEditItem(item)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-semibold">
                      Total:
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-lg">
                      ${total.toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setFileName("");
                setImportId(null);
                setLineItems([]);
              }}
            >
              Start Over
            </Button>
            <Button
              onClick={handleConvertToEstimate}
              disabled={loading || lineItems.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Estimate...
                </>
              ) : (
                <>
                  Create Estimate from Line Items
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="border rounded-xl p-12 text-center">
          <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Insurance Scope Imported</h2>
          <p className="text-gray-600 mb-6">Estimate ready. Redirecting...</p>
          <Button onClick={() => router.push("/dashboard/estimates")}>
            View All Estimates
          </Button>
        </div>
      )}
    </div>
  );
}

























