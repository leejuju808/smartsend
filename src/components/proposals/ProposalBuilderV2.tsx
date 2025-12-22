// Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
// Component: Proposal Builder (Contractor-Facing)

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";

interface ProposalBuilderV2Props {
  leadId: string;
  workspaceId: string;
  jobId?: string;
  onProposalCreated?: (proposal: any) => void;
}

export function ProposalBuilderV2({
  leadId,
  workspaceId,
  jobId,
  onProposalCreated,
}: ProposalBuilderV2Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteData, setQuoteData] = useState<any>(null);
  const [step, setStep] = useState<"quote" | "details" | "generate">("quote");

  // Quote inputs
  const [quoteInputs, setQuoteInputs] = useState({
    roof_size_squares: "",
    roof_pitch: "medium",
    material_type: "asphalt",
    layers_to_tear_off: "1",
    travel_distance_miles: "0",
    waste_factor_percent: "12.0",
    profit_margin_percent: "20.0",
  });

  // Proposal details
  const [proposalDetails, setProposalDetails] = useState({
    material_selection: {},
    warranty_details: {
      workmanship_years: "10",
      material_years: "30",
    },
    financing_options: {
      available: true,
      providers: ["wisetack", "sunlight"],
    },
    estimated_start_date: "",
    before_photos: [] as string[],
  });

  const handleCalculateQuote = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/proposals/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...quoteInputs,
          lead_id: leadId,
          workspace_id: workspaceId,
          save_calculation: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to calculate quote");
      }

      const data = await response.json();
      setQuoteData(data.quote);
      setStep("details");
    } catch (err: any) {
      setError(err.message || "Failed to calculate quote");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateProposal = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lead_id: leadId,
          job_id: jobId,
          workspace_id: workspaceId,
          roof_data: {
            size_squares: parseFloat(quoteInputs.roof_size_squares),
            pitch: quoteInputs.roof_pitch,
            material_type: quoteInputs.material_type,
            layers_to_tear_off: parseInt(quoteInputs.layers_to_tear_off),
          },
          quote_data: quoteData,
          material_selection: proposalDetails.material_selection,
          warranty_details: proposalDetails.warranty_details,
          financing_options: proposalDetails.financing_options,
          before_photos: proposalDetails.before_photos,
          estimated_start_date: proposalDetails.estimated_start_date || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate proposal");
      }

      const data = await response.json();
      
      if (onProposalCreated) {
        onProposalCreated(data.proposal);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate proposal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 border rounded-lg bg-white">
      <div>
        <h2 className="text-2xl font-bold mb-2">Proposal Builder</h2>
        <p className="text-gray-600">
          Generate professional roofing proposals instantly with AI-powered content.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center space-x-2 mb-6">
        <div
          className={`flex-1 h-2 rounded ${
            step === "quote" ? "bg-blue-600" : "bg-green-600"
          }`}
        />
        <div
          className={`flex-1 h-2 rounded ${
            step === "details" ? "bg-blue-600" : step === "generate" ? "bg-green-600" : "bg-gray-300"
          }`}
        />
        <div
          className={`flex-1 h-2 rounded ${
            step === "generate" ? "bg-blue-600" : "bg-gray-300"
          }`}
        />
      </div>

      {step === "quote" && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Step 1: Calculate Instant Quote</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Roof Size (Squares)
              </label>
              <Input
                type="number"
                value={quoteInputs.roof_size_squares}
                onChange={(e) =>
                  setQuoteInputs({ ...quoteInputs, roof_size_squares: e.target.value })
                }
                placeholder="e.g., 25"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Roof Pitch</label>
              <select
                className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                value={quoteInputs.roof_pitch}
                onChange={(e) =>
                  setQuoteInputs({ ...quoteInputs, roof_pitch: e.target.value })
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="steep">Steep</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Material Type</label>
              <select
                className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                value={quoteInputs.material_type}
                onChange={(e) =>
                  setQuoteInputs({ ...quoteInputs, material_type: e.target.value })
                }
              >
                <option value="asphalt">Asphalt Shingles</option>
                <option value="metal">Metal</option>
                <option value="tile">Tile</option>
                <option value="tpo">TPO</option>
                <option value="epdm">EPDM</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Layers to Tear Off
              </label>
              <Input
                type="number"
                value={quoteInputs.layers_to_tear_off}
                onChange={(e) =>
                  setQuoteInputs({ ...quoteInputs, layers_to_tear_off: e.target.value })
                }
                placeholder="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Travel Distance (miles)
              </label>
              <Input
                type="number"
                value={quoteInputs.travel_distance_miles}
                onChange={(e) =>
                  setQuoteInputs({ ...quoteInputs, travel_distance_miles: e.target.value })
                }
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Waste Factor (%)
              </label>
              <Input
                type="number"
                step="0.1"
                value={quoteInputs.waste_factor_percent}
                onChange={(e) =>
                  setQuoteInputs({ ...quoteInputs, waste_factor_percent: e.target.value })
                }
                placeholder="12.0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Profit Margin (%)
              </label>
              <Input
                type="number"
                step="0.1"
                value={quoteInputs.profit_margin_percent}
                onChange={(e) =>
                  setQuoteInputs({ ...quoteInputs, profit_margin_percent: e.target.value })
                }
                placeholder="20.0"
              />
            </div>
          </div>

          <Button
            onClick={handleCalculateQuote}
            disabled={loading || !quoteInputs.roof_size_squares}
            className="w-full"
          >
            {loading ? "Calculating..." : "Calculate Quote"}
          </Button>
        </div>
      )}

      {step === "details" && quoteData && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Step 2: Quote Summary</h3>
          
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span>Material Cost:</span>
              <span className="font-semibold">${quoteData.material_cost?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Labor Cost:</span>
              <span className="font-semibold">${quoteData.labor_cost?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Tear-Off Cost:</span>
              <span className="font-semibold">${quoteData.tear_off_cost?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Cost:</span>
              <span className="font-semibold">${quoteData.total_cost?.toLocaleString()}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-lg">
              <span>Suggested Retail:</span>
              <span className="font-bold text-blue-600">
                ${quoteData.suggested_retail?.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Insurance Match Price:</span>
              <span>${quoteData.insurance_match_price?.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Estimated Start Date
              </label>
              <Input
                type="date"
                value={proposalDetails.estimated_start_date}
                onChange={(e) =>
                  setProposalDetails({
                    ...proposalDetails,
                    estimated_start_date: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Workmanship Warranty (Years)
              </label>
              <Input
                type="number"
                value={proposalDetails.warranty_details.workmanship_years}
                onChange={(e) =>
                  setProposalDetails({
                    ...proposalDetails,
                    warranty_details: {
                      ...proposalDetails.warranty_details,
                      workmanship_years: e.target.value,
                    },
                  })
                }
                placeholder="10"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Material Warranty (Years)
              </label>
              <Input
                type="number"
                value={proposalDetails.warranty_details.material_years}
                onChange={(e) =>
                  setProposalDetails({
                    ...proposalDetails,
                    warranty_details: {
                      ...proposalDetails.warranty_details,
                      material_years: e.target.value,
                    },
                  })
                }
                placeholder="30"
              />
            </div>
          </div>

          <div className="flex space-x-4">
            <Button
              onClick={() => setStep("quote")}
              variant="outline"
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={() => setStep("generate")}
              className="flex-1"
            >
              Continue to Generate
            </Button>
          </div>
        </div>
      )}

      {step === "generate" && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Step 3: Generate Proposal</h3>
          <p className="text-gray-600">
            Review the quote summary above and click Generate to create your AI-powered proposal.
          </p>

          <div className="flex space-x-4">
            <Button
              onClick={() => setStep("details")}
              variant="outline"
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleGenerateProposal}
              disabled={loading}
              className="flex-1"
            >
              {loading ? "Generating Proposal..." : "Generate AI Proposal"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
































