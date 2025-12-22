// Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
// Component: Proposal Viewer (Homeowner-Facing, Mobile-Friendly)

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";

interface ProposalViewerV2Props {
  token: string;
  onSigned?: (proposal: any) => void;
}

export function ProposalViewerV2({ token, onSigned }: ProposalViewerV2Props) {
  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [showSignatureForm, setShowSignatureForm] = useState(false);
  const [signatureData, setSignatureData] = useState({
    signer_name: "",
    signer_email: "",
    signature_type: "typed" as "typed" | "drawn",
    typed_signature: "",
    drawn_signature: null as string | null,
  });

  useEffect(() => {
    loadProposal();
  }, [token]);

  const loadProposal = async () => {
    try {
      const response = await fetch(`/api/proposals/${token}/public`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to load proposal");
      }
      const data = await response.json();
      setProposal(data.proposal);
    } catch (err: any) {
      setError(err.message || "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!signatureData.signer_name) {
      setError("Please enter your name");
      return;
    }

    if (signatureData.signature_type === "typed" && !signatureData.typed_signature) {
      setError("Please enter your signature");
      return;
    }

    setSigning(true);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposal.id}/sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signer_name: signatureData.signer_name,
          signer_email: signatureData.signer_email,
          signature_data:
            signatureData.signature_type === "typed"
              ? signatureData.typed_signature
              : signatureData.drawn_signature,
          signature_type: signatureData.signature_type,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to sign proposal");
      }

      const data = await response.json();
      setProposal(data.proposal);

      if (onSigned) {
        onSigned(data.proposal);
      }

      setShowSignatureForm(false);
    } catch (err: any) {
      setError(err.message || "Failed to sign proposal");
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading proposal...</p>
        </div>
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">Proposal Not Found</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return null;
  }

  const lead = proposal.leads || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold mb-2">Roofing Proposal</h1>
          <p className="text-gray-600">
            {lead.first_name} {lead.last_name}
          </p>
        </div>
      </div>

      {/* Proposal Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Status Badge */}
        <div className="mb-6">
          {proposal.status === "signed" ? (
            <span className="inline-block px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
              ✓ Signed
            </span>
          ) : (
            <span className="inline-block px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
              Pending Signature
            </span>
          )}
        </div>

        {/* Proposal HTML Content */}
        <div
          className="bg-white rounded-lg shadow-sm p-6 mb-6 prose max-w-none"
          dangerouslySetInnerHTML={{ __html: proposal.html_content || "" }}
        />

        {/* Price Summary */}
        {proposal.price && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">Total Proposal Amount</p>
                <p className="text-3xl font-bold text-blue-600">
                  ${proposal.price.toLocaleString()}
                </p>
              </div>
              {proposal.financing_options?.available && (
                <Button variant="outline" className="ml-4">
                  View Financing Options
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Before Photos */}
        {proposal.before_photos && proposal.before_photos.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Before Photos</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {proposal.before_photos.map((photo: string, idx: number) => (
                <img
                  key={idx}
                  src={photo}
                  alt={`Before photo ${idx + 1}`}
                  className="w-full h-48 object-cover rounded-lg"
                />
              ))}
            </div>
          </div>
        )}

        {/* Warranty Information */}
        {proposal.warranty_details && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Warranty Information</h2>
            <div className="space-y-2">
              {proposal.warranty_details.workmanship_years && (
                <p>
                  <span className="font-semibold">Workmanship Warranty:</span>{" "}
                  {proposal.warranty_details.workmanship_years} years
                </p>
              )}
              {proposal.warranty_details.material_years && (
                <p>
                  <span className="font-semibold">Material Warranty:</span>{" "}
                  {proposal.warranty_details.material_years} years
                </p>
              )}
            </div>
          </div>
        )}

        {/* Signature Section */}
        {proposal.status !== "signed" && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">Accept Proposal</h2>
            <p className="text-gray-600 mb-6">
              By signing below, you agree to the terms and conditions outlined in this proposal.
            </p>

            {!showSignatureForm ? (
              <Button
                onClick={() => setShowSignatureForm(true)}
                className="w-full md:w-auto"
                size="lg"
              >
                Sign Proposal
              </Button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={signatureData.signer_name}
                    onChange={(e) =>
                      setSignatureData({
                        ...signatureData,
                        signer_name: e.target.value,
                      })
                    }
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    value={signatureData.signer_email}
                    onChange={(e) =>
                      setSignatureData({
                        ...signatureData,
                        signer_email: e.target.value,
                      })
                    }
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Signature Type
                  </label>
                  <select
                    className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                    value={signatureData.signature_type}
                    onChange={(e) =>
                      setSignatureData({
                        ...signatureData,
                        signature_type: e.target.value as "typed" | "drawn",
                      })
                    }
                  >
                    <option value="typed">Type Signature</option>
                    <option value="drawn">Draw Signature</option>
                  </select>
                </div>

                {signatureData.signature_type === "typed" ? (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Type Your Signature <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={signatureData.typed_signature}
                      onChange={(e) =>
                        setSignatureData({
                          ...signatureData,
                          typed_signature: e.target.value,
                        })
                      }
                      placeholder="Your signature"
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Draw Your Signature <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 h-48 flex items-center justify-center">
                      <p className="text-gray-500">
                        Signature drawing canvas (implement with canvas API)
                      </p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex space-x-4">
                  <Button
                    onClick={() => setShowSignatureForm(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSign}
                    disabled={signing}
                    className="flex-1"
                    size="lg"
                  >
                    {signing ? "Signing..." : "Sign & Accept Proposal"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Signed Confirmation */}
        {proposal.status === "signed" && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center space-x-3">
              <div className="text-green-600 text-2xl">✓</div>
              <div>
                <p className="font-semibold text-green-800">
                  Proposal Signed Successfully
                </p>
                <p className="text-sm text-green-600">
                  Signed on {new Date(proposal.signed_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
































