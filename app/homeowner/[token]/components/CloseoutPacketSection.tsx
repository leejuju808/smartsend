"use client";

// Block 45000 — SmartSend Roofing "AI Job Summary + Homeowner Closeout Packet" v1
// Component: Closeout Packet Section for Homeowner Portal

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, CheckCircle } from "lucide-react";
import { format } from "date-fns";

interface CloseoutPacketSectionProps {
  closeoutPacket: {
    id: string;
    pdf_url: string;
    summary_text: string | null;
    generated_at: string;
  } | null;
}

export function CloseoutPacketSection({ closeoutPacket }: CloseoutPacketSectionProps) {
  if (!closeoutPacket) {
    return null;
  }

  const handleDownload = () => {
    if (closeoutPacket.pdf_url) {
      // Track download
      fetch("/api/homeowner/closeout-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packet_id: closeoutPacket.id }),
      }).catch(console.error);

      // Open PDF in new tab
      window.open(closeoutPacket.pdf_url, "_blank");
    }
  };

  return (
    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-xl">Your Roof Replacement Summary</CardTitle>
          </div>
          <Badge variant="default" className="bg-blue-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Ready
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-gray-700">
          Your professional closeout packet is ready! This comprehensive document includes:
        </p>

        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 ml-2">
          <li>Complete job summary</li>
          <li>Before & after photos</li>
          <li>Materials used breakdown</li>
          <li>What was replaced</li>
          <li>Change order receipts</li>
          <li>Warranty information</li>
          <li>Maintenance recommendations</li>
        </ul>

        {closeoutPacket.summary_text && (
          <div className="p-4 bg-white rounded-md border border-gray-200">
            <h3 className="text-sm font-semibold mb-2 text-gray-800">Summary Preview</h3>
            <p className="text-sm text-gray-700 line-clamp-3">
              {closeoutPacket.summary_text.substring(0, 200)}
              {closeoutPacket.summary_text.length > 200 && "..."}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleDownload}
            className="w-full bg-blue-600 hover:bg-blue-700"
            size="lg"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Complete Packet (PDF)
          </Button>
          <p className="text-xs text-gray-500 text-center">
            Generated on {format(new Date(closeoutPacket.generated_at), "MMMM d, yyyy")}
          </p>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-600 text-center">
            💡 <strong>Tip:</strong> Save this PDF for your records. It includes all warranty information and maintenance recommendations.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
































