/**
 * Block 93000 — QR Code Manager
 * Create and manage QR codes for offline attribution tracking
 */

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Download, Copy } from "lucide-react";
// QRCode will be dynamically imported if needed

interface QRCode {
  id: string;
  url: string;
  label: string;
  short_code: string;
  scans: number;
  unique_scans: number;
  leads_generated: number;
  jobs_won: number;
  revenue_generated: number;
  is_active: boolean;
  created_at: string;
}

export function QRCodeManager() {
  const [qrCodes, setQRCodes] = useState<QRCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newQRCode, setNewQRCode] = useState({ url: "", label: "" });
  const [qrImageUrl, setQRImageUrl] = useState<string | null>(null);

  useEffect(() => {
    loadQRCodes();
  }, []);

  const loadQRCodes = async () => {
    try {
      const res = await fetch("/api/attribution/qr-codes");
      const data = await res.json();
      setQRCodes(data.qr_codes || []);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load QR codes:", err);
      setLoading(false);
    }
  };

  const createQRCode = async () => {
    if (!newQRCode.url || !newQRCode.label) {
      alert("URL and label are required");
      return;
    }

    try {
      const res = await fetch("/api/attribution/qr-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newQRCode),
      });

      if (!res.ok) throw new Error("Failed to create QR code");

      await loadQRCodes();
      setNewQRCode({ url: "", label: "" });
      setDialogOpen(false);
    } catch (err) {
      console.error("Failed to create QR code:", err);
      alert("Failed to create QR code");
    }
  };

  const generateQRImage = async (url: string) => {
    try {
      // Use a QR code API service or generate client-side
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
      setQRImageUrl(qrCodeUrl);
    } catch (err) {
      console.error("Failed to generate QR code image:", err);
    }
  };

  const downloadQRCode = async (url: string, label: string) => {
    try {
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(url)}`;
      const link = document.createElement("a");
      link.download = `${label.replace(/\s+/g, "-")}-qr-code.png`;
      link.href = qrCodeUrl;
      link.click();
    } catch (err) {
      console.error("Failed to download QR code:", err);
    }
  };

  const copyQRCodeUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    alert("QR code URL copied to clipboard");
  };

  if (loading) {
    return <div className="text-center py-8">Loading QR codes...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>QR Codes</CardTitle>
              <CardDescription>
                Generate QR codes for yard signs, door hangers, trucks, and more
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create QR Code
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create QR Code</DialogTitle>
                  <DialogDescription>
                    Generate a QR code that tracks scans and leads
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="label">Label</Label>
                    <Input
                      id="label"
                      value={newQRCode.label}
                      onChange={(e) =>
                        setNewQRCode({ ...newQRCode, label: e.target.value })
                      }
                      placeholder="e.g., Yard Sign - Main St"
                    />
                  </div>
                  <div>
                    <Label htmlFor="url">Destination URL</Label>
                    <Input
                      id="url"
                      value={newQRCode.url}
                      onChange={(e) =>
                        setNewQRCode({ ...newQRCode, url: e.target.value })
                      }
                      placeholder="https://example.com/landing-page"
                    />
                  </div>
                  <Button onClick={createQRCode} className="w-full">
                    Create QR Code
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {qrCodes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No QR codes yet. Create one to start tracking offline leads.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {qrCodes.map((qr) => {
                const scanUrl = `${window.location.origin}/api/attribution/qr-codes/${qr.id}/scan?redirect=${encodeURIComponent(qr.url)}`;
                return (
                  <Card key={qr.id}>
                    <CardHeader>
                      <CardTitle className="text-lg">{qr.label}</CardTitle>
                      <CardDescription className="text-xs">
                        {qr.short_code} • Created {new Date(qr.created_at).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-center">
                        <div className="border p-4 rounded">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(scanUrl)}`}
                            alt="QR Code"
                            className="w-32 h-32"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-gray-600">Scans</div>
                          <div className="font-semibold">{qr.scans}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Leads</div>
                          <div className="font-semibold">{qr.leads_generated}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Jobs Won</div>
                          <div className="font-semibold">{qr.jobs_won}</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Revenue</div>
                          <div className="font-semibold">
                            ${(qr.revenue_generated || 0).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadQRCode(scanUrl, qr.label)}
                          className="flex-1"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyQRCodeUrl(scanUrl)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



























