// Block 220000 — SmartSend Roofing Proposal Builder
// Page: Create Proposal from Estimate
// Preview template, swap themes, add photos, set expiration, generate and send

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Palette, Send, Eye, Image as ImageIcon } from "lucide-react";
import { PaymentMomentPaywallModal } from "@/components/roofing/PaymentMomentPaywallModal";

export default function ProposalBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = params.id as string;

  const [estimate, setEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<"classic" | "premium" | "insurance">("classic");
  const [photos, setPhotos] = useState<string[]>([]);
  const [validUntil, setValidUntil] = useState<string>("");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [proposal, setProposal] = useState<any>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    if (estimateId) {
      loadEstimate();
    }
  }, [estimateId]);

  const loadEstimate = async () => {
    try {
      const response = await fetch(`/api/estimates/${estimateId}`);
      if (response.ok) {
        const data = await response.json();
        setEstimate(data.estimate);
        generatePreview(data.estimate, theme);
      }
    } catch (error) {
      console.error("Error loading estimate:", error);
    } finally {
      setLoading(false);
    }
  };

  const generatePreview = (est: any, selectedTheme: string) => {
    // This would use the same HTML generation logic as the API
    // For now, we'll just show a placeholder
    setPreviewHtml(`<div>Preview for ${selectedTheme} theme</div>`);
  };

  const handleGenerateProposal = async () => {
    try {
      const response = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimate_id: estimateId,
          theme,
          photos,
          valid_until: validUntil || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setProposal(data.proposal);
        alert("Proposal generated successfully!");
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error generating proposal:", error);
      alert("Failed to generate proposal");
    }
  };

  const handleSendProposal = async () => {
    if (!proposal) {
      alert("Please generate proposal first");
      return;
    }

    try {
      const response = await fetch("/api/proposals/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_id: proposal.id,
          homeowner_email: estimate?.homeowner?.email,
          message: "",
        }),
      });

      if (response.ok) {
        alert("Proposal sent successfully!");
        router.push("/dashboard/estimates");
      } else {
        const error = await response.json();
        if (response.status === 402 && error?.code === "PAYWALL") {
          setPaywallOpen(true);
          return;
        }
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error sending proposal:", error);
      alert("Failed to send proposal");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="p-6">
        <p>Estimate not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PaymentMomentPaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        companyId={String(estimate?.company_id || "")}
      />

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Proposal Builder</h1>
        <p className="text-gray-600">
          Create a professional proposal from your estimate
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar - Settings */}
        <div className="lg:col-span-1 space-y-6">
          {/* Theme Selection */}
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <h3 className="font-semibold mb-3 flex items-center">
              <Palette className="w-4 h-4 mr-2" />
              Theme
            </h3>
            <div className="space-y-2">
              {(["classic", "premium", "insurance"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTheme(t);
                    generatePreview(estimate, t);
                  }}
                  className={`w-full px-4 py-2 rounded-lg text-left ${
                    theme === t
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <h3 className="font-semibold mb-3 flex items-center">
              <ImageIcon className="w-4 h-4 mr-2" />
              Photos
            </h3>
            <div className="space-y-2">
              {photos.map((photo, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm truncate">{photo}</span>
                  <button
                    onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                    className="text-red-500"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <Input
                type="url"
                placeholder="Add photo URL"
                onKeyPress={(e: any) => {
                  if (e.key === "Enter" && e.target.value) {
                    setPhotos([...photos, e.target.value]);
                    e.target.value = "";
                  }
                }}
              />
            </div>
          </div>

          {/* Expiration */}
          <div className="bg-white rounded-lg shadow-sm p-4 border">
            <h3 className="font-semibold mb-3">Valid Until</h3>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Button
              onClick={handleGenerateProposal}
              className="w-full"
              disabled={!estimate}
            >
              Generate Proposal
            </Button>
            {proposal && (
              <Button
                onClick={handleSendProposal}
                variant="outline"
                className="w-full"
              >
                <Send className="w-4 h-4 mr-2" />
                Send to Homeowner
              </Button>
            )}
          </div>
        </div>

        {/* Right Side - Preview */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm p-6 border">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold flex items-center">
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </h3>
              {proposal && (
                <a
                  href={proposal.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 text-sm"
                >
                  Open in new tab
                </a>
              )}
            </div>
            <div className="border rounded-lg p-4 bg-gray-50 min-h-[600px]">
              {previewHtml ? (
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <div className="text-center text-gray-500 py-20">
                  <p>Preview will appear here</p>
                  <p className="text-sm mt-2">Select a theme and generate proposal</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

























