"use client";

// Block 45000 — SmartSend Roofing "AI Job Summary + Homeowner Closeout Packet" v1
// Component: Closeout Packet Panel for Contractor Dashboard

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Download, 
  Mail, 
  RefreshCw, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  ExternalLink,
  Image as ImageIcon
} from "lucide-react";
import { format } from "date-fns";

interface CloseoutPacketPanelProps {
  jobId: string;
}

interface CloseoutPacket {
  id: string;
  status: "pending" | "generating" | "generated" | "sent" | "failed";
  pdf_url: string | null;
  ai_summary_text: string | null;
  summary_json: any;
  sent_to_homeowner_at: string | null;
  sent_to_email: string | null;
  homeowner_viewed_at: string | null;
  homeowner_downloaded_at: string | null;
  generated_at: string | null;
  error_message: string | null;
  created_at: string;
  closeout_media: Array<{
    id: string;
    category: string;
    photo_urls: string[];
    ai_description: string;
  }>;
  closeout_materials: Array<{
    id: string;
    material_name: string;
    estimated_quantity: number | null;
    actual_quantity: number;
    unit: string;
    difference: number;
  }>;
  closeout_replacements: Array<{
    id: string;
    item_description: string;
    quantity: number | null;
    reason: string | null;
  }>;
  closeout_change_orders: Array<{
    id: string;
    description: string;
    amount: number;
    approved_at: string;
  }>;
}

export function CloseoutPacketPanel({ jobId }: CloseoutPacketPanelProps) {
  const [packet, setPacket] = useState<CloseoutPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPacket = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/jobs/${jobId}/closeout-packet`);
      
      if (response.status === 404) {
        setPacket(null);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch closeout packet");
      }

      const data = await response.json();
      setPacket(data.packet);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPacket();
    
    // Poll for updates if status is pending or generating
    const interval = setInterval(() => {
      if (packet && (packet.status === "pending" || packet.status === "generating")) {
        fetchPacket();
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [jobId, packet?.status]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);
      
      const response = await fetch(`/api/jobs/${jobId}/closeout-packet`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to generate closeout packet");
      }

      // Refresh packet data
      await fetchPacket();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleResend = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/closeout-packet`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend" }),
      });

      if (!response.ok) {
        throw new Error("Failed to resend closeout packet");
      }

      await fetchPacket();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pending", variant: "outline" },
      generating: { label: "Generating...", variant: "secondary" },
      generated: { label: "Generated", variant: "default" },
      sent: { label: "Sent to Homeowner", variant: "default" },
      failed: { label: "Failed", variant: "destructive" },
    };

    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Closeout Packet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!packet) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Closeout Packet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Generate a professional closeout packet for this completed job. This includes:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-4">
            <li>AI-generated job summary</li>
            <li>Before/after photo layout</li>
            <li>Materials used breakdown</li>
            <li>What was replaced</li>
            <li>Change order receipts</li>
            <li>Warranty information</li>
            <li>Maintenance recommendations</li>
          </ul>
          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            {generating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generate Closeout Packet
              </>
            )}
          </Button>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Closeout Packet
          </CardTitle>
          {getStatusBadge(packet.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {packet.status === "failed" && packet.error_message && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Generation Failed</p>
                <p className="text-sm text-yellow-700 mt-1">{packet.error_message}</p>
              </div>
            </div>
          </div>
        )}

        {packet.status === "generating" && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
              <p className="text-sm text-blue-800">
                Generating your closeout packet. This may take a minute...
              </p>
            </div>
          </div>
        )}

        {packet.status === "generated" && (
          <>
            {/* Summary Preview */}
            {packet.ai_summary_text && (
              <div>
                <h3 className="text-sm font-semibold mb-2">AI Summary</h3>
                <div className="p-4 bg-gray-50 rounded-md">
                  <p className="text-sm text-gray-700 whitespace-pre-line">
                    {packet.ai_summary_text.substring(0, 300)}
                    {packet.ai_summary_text.length > 300 && "..."}
                  </p>
                </div>
              </div>
            )}

            {/* Materials Breakdown */}
            {packet.closeout_materials && packet.closeout_materials.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Materials Used</h3>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Material</th>
                        <th className="px-3 py-2 text-right">Estimated</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        <th className="px-3 py-2 text-right">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packet.closeout_materials.map((material) => (
                        <tr key={material.id} className="border-t">
                          <td className="px-3 py-2">{material.material_name}</td>
                          <td className="px-3 py-2 text-right">
                            {material.estimated_quantity !== null
                              ? `${material.estimated_quantity} ${material.unit}`
                              : "N/A"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {material.actual_quantity} {material.unit}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {material.difference > 0 ? "+" : ""}
                            {material.difference.toFixed(1)} {material.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Photo Counts */}
            {packet.closeout_media && packet.closeout_media.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Photos Included</h3>
                <div className="grid grid-cols-2 gap-2">
                  {packet.closeout_media.map((media) => (
                    <div
                      key={media.id}
                      className="p-3 bg-gray-50 rounded-md flex items-center gap-2"
                    >
                      <ImageIcon className="h-4 w-4 text-gray-500" />
                      <span className="text-sm capitalize">{media.category}</span>
                      <span className="text-sm text-gray-500">
                        ({media.photo_urls.length})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-4 border-t">
              {packet.pdf_url && (
                <Button
                  asChild
                  variant="default"
                  className="w-full"
                >
                  <a
                    href={packet.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </a>
                </Button>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleGenerate}
                  variant="outline"
                  className="flex-1"
                  disabled={generating}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
                <Button
                  onClick={handleResend}
                  variant="outline"
                  className="flex-1"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Resend to Homeowner
                </Button>
              </div>
            </div>

            {/* Delivery Status */}
            {packet.sent_to_homeowner_at && (
              <div className="pt-4 border-t">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>
                      Sent to {packet.sent_to_email || "homeowner"} on{" "}
                      {format(new Date(packet.sent_to_homeowner_at), "MMM d, yyyy")}
                    </span>
                  </div>
                  {packet.homeowner_viewed_at && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <ExternalLink className="h-4 w-4" />
                      <span>
                        Viewed on {format(new Date(packet.homeowner_viewed_at), "MMM d, yyyy")}
                      </span>
                    </div>
                  )}
                  {packet.homeowner_downloaded_at && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Download className="h-4 w-4" />
                      <span>
                        Downloaded on{" "}
                        {format(new Date(packet.homeowner_downloaded_at), "MMM d, yyyy")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {packet.generated_at && (
              <p className="text-xs text-gray-500">
                Generated on {format(new Date(packet.generated_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
































