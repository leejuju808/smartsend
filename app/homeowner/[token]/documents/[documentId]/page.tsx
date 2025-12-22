"use client";

// Block 22830 — SmartSend Roofing Document Delivery & E-Sign v1
// Homeowner Document Signing Page
// Accessible via token: /homeowner/[token]/documents/[documentId]

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { FileText, PenTool, CheckCircle, Loader2, X } from "lucide-react";

type DocumentData = {
  id: string;
  document_type: string;
  status: string;
  pdf_url: string;
  signer_email: string | null;
};

export default function DocumentSigningPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const documentId = params.documentId as string;

  const [document, setDocument] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signatureType, setSignatureType] = useState<"type" | "draw">("type");
  const [typedSignature, setTypedSignature] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");

  // Canvas for drawing signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !documentId) return;

    const fetchDocument = async () => {
      try {
        setLoading(true);
        // Fetch document data from edge function or API
        const response = await fetch(
          `/api/homeowner/documents/${documentId}?token=${token}`
        );

        if (!response.ok) {
          throw new Error("Document not found");
        }

        const data = await response.json();
        setDocument(data);
      } catch (err: any) {
        console.error("Error fetching document:", err);
        setError(err.message || "Failed to load document");
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [token, documentId]);

  // Initialize canvas for drawing
  useEffect(() => {
    if (signatureType === "draw" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
  }, [signatureType]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (!canvasRef.current) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    const imageData = canvas.toDataURL("image/png");
    setSignatureImage(imageData);
  };

  const clearSignature = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setSignatureImage(null);
  };

  const handleSign = async () => {
    if (!document) return;

    // Validate inputs
    if (!signerName.trim()) {
      setError("Please enter your name");
      return;
    }

    if (signatureType === "type" && !typedSignature.trim()) {
      setError("Please enter your signature");
      return;
    }

    if (signatureType === "draw" && !signatureImage) {
      setError("Please draw your signature");
      return;
    }

    try {
      setSigning(true);
      setError(null);

      // Get IP address (simplified - in production, get from server)
      const signerIp = "unknown"; // Would be set server-side in production

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/documents-sign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            document_id: documentId,
            signature_text: signatureType === "type" ? typedSignature : signerName,
            signature_image: signatureImage,
            signer_name: signerName,
            signer_email: signerEmail || document.signer_email,
            signer_ip: signerIp,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to sign document");
      }

      // Success - redirect or show success message
      router.push(`/homeowner/${token}?signed=true`);
    } catch (err: any) {
      console.error("Error signing document:", err);
      setError(err.message || "Failed to sign document");
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (error && !document) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">Unable to Load Document</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">{error}</p>
            <Button
              onClick={() => router.push(`/homeowner/${token}`)}
              className="mt-4"
            >
              Back to Portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!document) {
    return null;
  }

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

  const isSigned = document.status === "signed";

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-blue-600" />
                <CardTitle className="text-xl">
                  {getDocumentTypeLabel(document.document_type)}
                </CardTitle>
              </div>
              {isSigned && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Signed</span>
                </div>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* PDF Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Document Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <iframe
                src={document.pdf_url}
                className="w-full h-[600px]"
                title="Document Preview"
              />
            </div>
          </CardContent>
        </Card>

        {/* Signing Form */}
        {!isSigned && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sign This Document</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Signature Type Toggle */}
              <div className="flex gap-4 border-b pb-4">
                <button
                  onClick={() => setSignatureType("type")}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    signatureType === "type"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Type Signature
                </button>
                <button
                  onClick={() => setSignatureType("draw")}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    signatureType === "draw"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Draw Signature
                </button>
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full"
                />
              </div>

              {/* Email Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Email
                </label>
                <Input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder={document.signer_email || "Enter your email"}
                  className="w-full"
                />
              </div>

              {/* Signature Input */}
              {signatureType === "type" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Signature <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={typedSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                    placeholder="Type your signature"
                    className="w-full"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Draw Your Signature <span className="text-red-500">*</span>
                  </label>
                  <div className="border-2 border-gray-300 rounded-lg bg-white relative">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={200}
                      className="w-full cursor-crosshair"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                    />
                    {signatureImage && (
                      <button
                        onClick={clearSignature}
                        className="absolute top-2 right-2 p-2 bg-gray-100 rounded-full hover:bg-gray-200"
                        type="button"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Click and drag to draw your signature
                  </p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex gap-4">
                <Button
                  onClick={() => router.push(`/homeowner/${token}`)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSign}
                  disabled={signing}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {signing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    <>
                      <PenTool className="h-4 w-4 mr-2" />
                      Sign Document
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Already Signed Message */}
        {isSigned && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Document Already Signed
                </h3>
                <p className="text-gray-600 mb-6">
                  This document has already been signed. You can view the signed
                  version above.
                </p>
                <Button
                  onClick={() => router.push(`/homeowner/${token}`)}
                  variant="outline"
                >
                  Back to Portal
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}







































