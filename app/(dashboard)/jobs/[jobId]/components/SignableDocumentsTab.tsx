"use client";

// Block 22830 — SmartSend Roofing Document Delivery & E-Sign v1
// Signable Documents Tab Component

import useSWR from "swr";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Send, Download, Eye, CheckCircle, Clock, X } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SignableDocumentsTabProps {
  jobId: string;
}

interface SignableDocument {
  id: string;
  document_type: string;
  status: "sent" | "viewed" | "signed" | "void";
  pdf_url: string | null;
  signed_pdf_url: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signed_at: string | null;
  created_at: string;
  version: number;
}

export function SignableDocumentsTab({ jobId }: SignableDocumentsTabProps) {
  const { data, error, mutate } = useSWR(
    `/api/jobs/${jobId}/documents`,
    fetcher
  );

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unsigned" | "signed">("all");

  async function uploadDocument(formData: FormData) {
    setUploading(true);
    setUploadError(null);

    try {
      const res = await fetch("/api/jobs/documents/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setUploadError(json.error || "Upload failed");
        return;
      }

      if (json.success) {
        mutate(); // refresh list
        const form = document.getElementById(
          "upload-signable-form"
        ) as HTMLFormElement;
        if (form) form.reset();
      }
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function sendToHomeowner(documentId: string, signerEmail: string) {
    try {
      // This would call the documents-send edge function
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/documents-send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            document_id: documentId,
            signer_email: signerEmail,
          }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to send document");
      }

      mutate();
    } catch (err: any) {
      console.error("Error sending document:", err);
      alert(err.message || "Failed to send document");
    }
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">
        Error loading documents: {error.message}
      </div>
    );
  }

  const allDocs: SignableDocument[] = data?.documents || [];
  
  // Filter documents
  const filteredDocs = allDocs.filter((doc) => {
    if (filter === "unsigned") return doc.status !== "signed";
    if (filter === "signed") return doc.status === "signed";
    return true;
  });

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      estimate: "Estimate",
      contract: "Contract",
      change_order: "Change Order",
      invoice: "Invoice",
      warranty: "Warranty",
      other: "Document",
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "signed":
        return (
          <Badge className="bg-green-600 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Signed
          </Badge>
        );
      case "viewed":
        return (
          <Badge className="bg-blue-600 text-white">
            <Eye className="h-3 w-3 mr-1" />
            Viewed
          </Badge>
        );
      case "sent":
        return (
          <Badge className="bg-yellow-600 text-white">
            <Clock className="h-3 w-3 mr-1" />
            Sent
          </Badge>
        );
      case "void":
        return (
          <Badge className="bg-gray-600 text-white">
            <X className="h-3 w-3 mr-1" />
            Void
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* UPLOAD FORM */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-4 shadow-sm">
        <p className="font-semibold mb-3 text-zinc-50">Upload Signable Document</p>

        <form
          id="upload-signable-form"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            uploadDocument(fd);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="job_id" value={jobId} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                Document Type <span className="text-red-400">*</span>
              </label>
              <select
                name="document_type"
                required
                className="border border-zinc-800 rounded px-2 py-1 w-full text-sm bg-zinc-900 text-zinc-50"
              >
                <option value="estimate">Estimate</option>
                <option value="contract">Contract</option>
                <option value="change_order">Change Order</option>
                <option value="invoice">Invoice</option>
                <option value="warranty">Warranty</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                Signer Email (optional)
              </label>
              <input
                type="email"
                name="signer_email"
                className="border border-zinc-800 rounded px-2 py-1 w-full text-sm bg-zinc-900 text-zinc-50"
                placeholder="homeowner@example.com"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">
              PDF File <span className="text-red-400">*</span>
            </label>
            <input
              type="file"
              name="file"
              accept="application/pdf"
              required
              className="text-sm text-zinc-50 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-50 hover:file:bg-zinc-700 w-full"
            />
          </div>

          {uploadError && (
            <p className="text-xs text-red-400">{uploadError}</p>
          )}

          <button
            type="submit"
            className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-50 px-3 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Upload PDF"}
          </button>
        </form>
      </div>

      {/* FILTERS */}
      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All ({allDocs.length})
        </Button>
        <Button
          variant={filter === "unsigned" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("unsigned")}
        >
          Unsigned ({allDocs.filter((d) => d.status !== "signed").length})
        </Button>
        <Button
          variant={filter === "signed" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("signed")}
        >
          Signed ({allDocs.filter((d) => d.status === "signed").length})
        </Button>
      </div>

      {/* DOCUMENT LIST */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-3">
          Signable Documents ({filteredDocs.length})
        </p>
        {filteredDocs.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No signable documents yet. Upload your first document above.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="border border-zinc-800 rounded-lg bg-zinc-950 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-blue-400" />
                    <div>
                      <p className="font-semibold text-zinc-50">
                        {getDocumentTypeLabel(doc.document_type)} v{doc.version}
                      </p>
                      {doc.signer_email && (
                        <p className="text-xs text-zinc-400">
                          To: {doc.signer_email}
                        </p>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(doc.status)}
                </div>

                <div className="flex items-center gap-2 mt-3">
                  {doc.pdf_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(doc.pdf_url!, "_blank")}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Original
                    </Button>
                  )}
                  {doc.signed_pdf_url && doc.status === "signed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(doc.signed_pdf_url!, "_blank")}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download Signed
                    </Button>
                  )}
                  {doc.status !== "signed" && doc.signer_email && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendToHomeowner(doc.id, doc.signer_email!)}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Resend
                    </Button>
                  )}
                </div>

                {doc.status === "signed" && doc.signed_at && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Signed by {doc.signer_name || "Unknown"} on{" "}
                    {new Date(doc.signed_at).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}







































