// Block 180000 — SmartSend Roofing AI Insurance Claim Assistant v1
// Component: Insurance Claim Tab
// Full insurance claim workflow with AI-powered features

"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DollarSign,
  FileText,
  Image,
  Download,
  Mail,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Claim {
  id: string;
  job_id: string;
  policy_holder: string;
  insurance_carrier: string;
  claim_number: string;
  deductible: number;
  rcv: number;
  acv: number;
  depreciation: number;
  notes: string;
  status: string;
}

interface LineItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  category: string;
}

interface Supplement {
  id: string;
  reason: string;
  explanation: string;
  amount: number;
  status: string;
}

export function InsuranceClaimTab({ jobId }: { jobId: string }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [generating, setGenerating] = useState(false);

  // Fetch claim data
  const { data: claimData, error, mutate } = useSWR(
    `/api/jobs/${jobId}/insurance-claim`,
    fetcher
  );

  const claim: Claim | null = claimData?.claim || null;
  const lineItems: LineItem[] = claimData?.line_items || [];
  const supplements: Supplement[] = claimData?.supplements || [];
  const photoAnalyses = claimData?.photo_analyses || [];

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  const netClaim = (claim?.rcv || 0) - (claim?.deductible || 0);

  const handleAnalyzePhotos = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/insurance-claim/analyze-photos`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Photos analyzed successfully!");
        mutate();
      } else {
        toast.error(data.error || "Failed to analyze photos");
      }
    } catch (error) {
      toast.error("Failed to analyze photos");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateScope = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/insurance-claim/generate-scope`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Scope generated successfully!");
        mutate();
      } else {
        toast.error(data.error || "Failed to generate scope");
      }
    } catch (error) {
      toast.error("Failed to generate scope");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateSupplement = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/insurance-claim/generate-supplement`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Supplement generated successfully!");
        mutate();
      } else {
        toast.error(data.error || "Failed to generate supplement");
      }
    } catch (error) {
      toast.error("Failed to generate supplement");
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/insurance-claim/export-pdf`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `claim-${claim?.claim_number || "scope"}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("PDF exported successfully!");
    } catch (error) {
      toast.error("Failed to export PDF");
    }
  };

  const handleEmailAdjuster = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/insurance-claim/email-adjuster`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Email sent to adjuster!");
      } else {
        toast.error(data.error || "Failed to send email");
      }
    } catch (error) {
      toast.error("Failed to send email");
    }
  };

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">
        Error loading insurance claim data.
      </div>
    );
  }

  if (!claimData) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-32 w-full bg-zinc-800 rounded-lg"></div>
          <div className="h-64 w-full bg-zinc-800 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 bg-zinc-900">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scope">Scope</TabsTrigger>
          <TabsTrigger value="supplements">Supplements</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-50 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Claim Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-400">Carrier</Label>
                  <div className="text-zinc-50 font-medium mt-1">
                    {claim?.insurance_carrier || "—"}
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-400">Claim #</Label>
                  <div className="text-zinc-50 font-medium mt-1">
                    {claim?.claim_number || "—"}
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-400">Policy Holder</Label>
                  <div className="text-zinc-50 font-medium mt-1">
                    {claim?.policy_holder || "—"}
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-400">Status</Label>
                  <div className="text-zinc-50 font-medium mt-1 flex items-center gap-2">
                    {claim?.status === "open" && <CheckCircle className="w-4 h-4 text-green-400" />}
                    {claim?.status === "pending" && <Clock className="w-4 h-4 text-yellow-400" />}
                    {claim?.status === "denied" && <AlertTriangle className="w-4 h-4 text-red-400" />}
                    {claim?.status || "open"}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-zinc-400">Deductible</Label>
                    <div className="text-zinc-50 font-semibold text-lg mt-1">
                      {formatCurrency(claim?.deductible || 0)}
                    </div>
                  </div>
                  <div>
                    <Label className="text-zinc-400">RCV</Label>
                    <div className="text-zinc-50 font-semibold text-lg mt-1">
                      {formatCurrency(claim?.rcv || 0)}
                    </div>
                  </div>
                  <div>
                    <Label className="text-zinc-400">ACV</Label>
                    <div className="text-zinc-50 font-semibold text-lg mt-1">
                      {formatCurrency(claim?.acv || 0)}
                    </div>
                  </div>
                  <div>
                    <Label className="text-zinc-400">Net Claim</Label>
                    <div className="text-green-400 font-semibold text-lg mt-1">
                      {formatCurrency(netClaim)}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scope Tab */}
        <TabsContent value="scope" className="mt-4 space-y-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-zinc-50">Scope</CardTitle>
                <CardDescription className="text-zinc-400">
                  Line items for this claim
                </CardDescription>
              </div>
              <Button
                onClick={handleGenerateScope}
                disabled={generating}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                AI Generate Scope
              </Button>
            </CardHeader>
            <CardContent>
              {lineItems.length === 0 ? (
                <div className="text-center py-8 text-zinc-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No line items yet. Generate a scope with AI or add manually.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-6 gap-4 p-2 bg-zinc-900 rounded text-xs font-semibold text-zinc-400">
                    <div>Code</div>
                    <div className="col-span-2">Description</div>
                    <div className="text-right">Quantity</div>
                    <div className="text-right">Unit Price</div>
                    <div className="text-right">Total</div>
                  </div>
                  {lineItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-6 gap-4 p-2 bg-zinc-900 rounded text-sm text-zinc-300"
                    >
                      <div className="font-mono text-xs">{item.code || "—"}</div>
                      <div className="col-span-2">{item.description}</div>
                      <div className="text-right">{item.quantity}</div>
                      <div className="text-right">{formatCurrency(item.unit_price || 0)}</div>
                      <div className="text-right font-semibold">
                        {formatCurrency(item.total_price || 0)}
                      </div>
                    </div>
                  ))}
                  <div className="pt-4 border-t border-zinc-800 mt-4">
                    <div className="flex justify-end">
                      <div className="text-right">
                        <div className="text-zinc-400 text-sm">Subtotal</div>
                        <div className="text-zinc-50 font-semibold text-lg">
                          {formatCurrency(subtotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Supplements Tab */}
        <TabsContent value="supplements" className="mt-4 space-y-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-zinc-50">Supplements</CardTitle>
                <CardDescription className="text-zinc-400">
                  Additional items requested from insurance
                </CardDescription>
              </div>
              <Button
                onClick={handleGenerateSupplement}
                disabled={generating}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                AI Generate Supplement
              </Button>
            </CardHeader>
            <CardContent>
              {supplements.length === 0 ? (
                <div className="text-center py-8 text-zinc-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No supplements yet. Generate one with AI or create manually.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {supplements.map((supplement) => (
                    <Card key={supplement.id} className="bg-zinc-900 border-zinc-800">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-zinc-50 text-sm">
                            {supplement.reason}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs px-2 py-1 rounded ${
                                supplement.status === "approved"
                                  ? "bg-green-900 text-green-400"
                                  : supplement.status === "denied"
                                  ? "bg-red-900 text-red-400"
                                  : "bg-yellow-900 text-yellow-400"
                              }`}
                            >
                              {supplement.status}
                            </span>
                            <span className="text-zinc-50 font-semibold">
                              {formatCurrency(supplement.amount)}
                            </span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-zinc-300 text-sm whitespace-pre-wrap">
                          {supplement.explanation}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="mt-4 space-y-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-zinc-50">Photos & AI Analysis</CardTitle>
                <CardDescription className="text-zinc-400">
                  Upload photos and analyze with AI
                </CardDescription>
              </div>
              <Button
                onClick={handleAnalyzePhotos}
                disabled={generating}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Analyze Photos with AI
              </Button>
            </CardHeader>
            <CardContent>
              {photoAnalyses.length === 0 ? (
                <div className="text-center py-8 text-zinc-400">
                  <Image className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No photo analyses yet. Upload photos and analyze with AI.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {photoAnalyses.map((analysis: any) => (
                    <Card key={analysis.id} className="bg-zinc-900 border-zinc-800">
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <Label className="text-zinc-400">Damage Detected</Label>
                            <div className="text-zinc-50 mt-1">
                              {analysis.damage_types?.join(", ") || "None"}
                            </div>
                          </div>
                          <div>
                            <Label className="text-zinc-400">Materials</Label>
                            <div className="text-zinc-50 mt-1">
                              {analysis.materials?.join(", ") || "Unknown"}
                            </div>
                          </div>
                          <div>
                            <Label className="text-zinc-400">Estimated Squares</Label>
                            <div className="text-zinc-50 mt-1">{analysis.est_squares || "—"}</div>
                          </div>
                          <div>
                            <Label className="text-zinc-400">Confidence</Label>
                            <div className="text-zinc-50 mt-1">
                              {((analysis.confidence_score || 0) * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>
                        {analysis.recommended_line_items?.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-zinc-800">
                            <Label className="text-zinc-400">Recommended Line Items</Label>
                            <div className="mt-2 space-y-1">
                              {analysis.recommended_line_items.map((item: any, idx: number) => (
                                <div key={idx} className="text-sm text-zinc-300">
                                  {item.code || "—"}: {item.description} ({item.quantity})
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="mt-4 space-y-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-50">Export</CardTitle>
              <CardDescription className="text-zinc-400">
                Export scope and supplements for adjusters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Button
                  onClick={handleExportPDF}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={lineItems.length === 0}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export to PDF
                </Button>
                <Button
                  onClick={handleEmailAdjuster}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={!claim?.adjuster_email}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Email Adjuster
                </Button>
                <Button
                  onClick={handleExportPDF}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={lineItems.length === 0}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Spreadsheet
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


























