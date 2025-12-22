// Block 25940 — SmartSend Roofing Proposal Builder v1
// Visual Proposal Display Component with Good/Better/Best Pricing, Upgrades, Signatures

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  Copy,
  Mail,
  Download,
  FileText,
  ChevronDown,
  ChevronUp,
  Check,
  Star,
  Shield,
  TrendingUp,
  Clock,
  AlertCircle,
  Image as ImageIcon,
  Plus,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { FinancingOptions } from "@/components/financing/FinancingOptions";

interface PricingTier {
  name: string;
  price: number;
  description: string;
  features: string[];
  selected?: boolean;
  is_popular?: boolean;
}

interface PricingTierModel {
  good: PricingTier;
  better: PricingTier;
  best: PricingTier;
}

interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  selected?: boolean;
  image_url?: string;
}

interface ProposalV1Data {
  homeowner_name: string;
  property_address: string;
  roof_summary: {
    scope: string;
    material: string;
    code_items: string[];
  };
  project_price: number;
  insurance_comparison?: {
    carrier: string;
    rcv_total: number;
    deductible: number;
    depreciation_recoverable: boolean;
    notes: string;
  };
  line_items: Array<{
    description: string;
    category: string;
    quantity: number;
    unit: string;
    total_cost: number;
  }>;
  warranty: string;
  timeline: string;
  next_steps: string;
  pricing_tier_model?: PricingTierModel;
  upgrade_options?: UpgradeOption[];
  warranty_details?: any;
  insurance_mode?: any;
  inspection_sections?: any;
  visual_elements?: any;
}

interface Proposal {
  id: string;
  thread_id: string;
  status: string;
  proposal_data: ProposalV1Data;
  proposal_text: string;
  pricing_tier_model?: PricingTierModel;
  upgrade_options?: UpgradeOption[];
  warranty_details?: any;
  insurance_mode?: any;
  inspection_sections?: any;
  visual_elements?: any;
  created_at: string;
}

interface ProposalDisplayV1Props {
  threadId: string;
  proposal?: Proposal | null;
  onProposalGenerated?: (proposal: Proposal) => void;
  homeownerView?: boolean; // If true, show homeowner-friendly view
}

export function ProposalDisplayV1({
  threadId,
  proposal: initialProposal,
  onProposalGenerated,
  homeownerView = false,
}: ProposalDisplayV1Props) {
  const [proposal, setProposal] = useState<Proposal | null>(initialProposal || null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [selectedTier, setSelectedTier] = useState<"good" | "better" | "best">("better");
  const [selectedUpgrades, setSelectedUpgrades] = useState<Set<string>>(new Set());
  const [viewStartTime] = useState(Date.now());

  useEffect(() => {
    if (!initialProposal && threadId) {
      loadProposal();
    }
  }, [threadId, initialProposal]);

  useEffect(() => {
    // Track proposal view
    if (proposal && homeownerView) {
      trackAnalytics("view");
    }
  }, [proposal, homeownerView]);

  const loadProposal = async () => {
    try {
      const response = await fetch(`/api/inbox/proposals/generate?threadId=${threadId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.proposal) {
          setProposal(data.proposal);
        }
      } else if (response.status === 404) {
        setProposal(null);
      }
    } catch (error) {
      console.error("Error loading proposal:", error);
    }
  };

  const trackAnalytics = async (actionType: string, metadata?: any) => {
    if (!proposal) return;

    try {
      await fetch(`/api/inbox/proposals/${proposal.id}/analytics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: actionType,
          ...metadata,
        }),
      });
    } catch (error) {
      console.error("Error tracking analytics:", error);
    }
  };

  const handleGenerateProposal = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/inbox/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate proposal");
      }

      const data = await response.json();
      setProposal(data.proposal);
      toast.success("Proposal generated successfully!");

      if (onProposalGenerated) {
        onProposalGenerated(data.proposal);
      }
    } catch (error: any) {
      console.error("Error generating proposal:", error);
      toast.error(error.message || "Failed to generate proposal");
    } finally {
      setGenerating(false);
    }
  };

  const handleTierSelect = (tier: "good" | "better" | "best") => {
    setSelectedTier(tier);
    trackAnalytics("tier_select", { tier_viewed: tier });
  };

  const handleUpgradeToggle = async (upgradeId: string) => {
    if (!proposal) return;

    const newSelected = new Set(selectedUpgrades);
    const isSelected = newSelected.has(upgradeId);

    if (isSelected) {
      newSelected.delete(upgradeId);
    } else {
      newSelected.add(upgradeId);
    }

    setSelectedUpgrades(newSelected);

    // Update on server
    try {
      await fetch(`/api/inbox/proposals/${proposal.id}/upgrades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upgrade_id: upgradeId,
          selected: !isSelected,
        }),
      });
    } catch (error) {
      console.error("Error updating upgrade:", error);
    }
  };

  const calculateTotal = () => {
    if (!proposal?.pricing_tier_model) return 0;

    const tierPrice = proposal.pricing_tier_model[selectedTier].price;
    const upgradesTotal = Array.from(selectedUpgrades).reduce((sum, upgradeId) => {
      const upgrade = proposal.upgrade_options?.find((u) => u.id === upgradeId);
      return sum + (upgrade?.price || 0);
    }, 0);

    return tierPrice + upgradesTotal;
  };

  if (!proposal) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-lg mb-2">No Proposal Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Generate a beautiful, psychology-optimized proposal
              </p>
              <Button onClick={handleGenerateProposal} disabled={generating} className="w-full">
                {generating ? "Generating..." : "Generate Proposal"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const proposalData = proposal.proposal_data;
  const pricingTiers = proposal.pricing_tier_model || proposalData.pricing_tier_model;
  const upgradeOptions = proposal.upgrade_options || proposalData.upgrade_options || [];
  const insuranceMode = proposal.insurance_mode || proposalData.insurance_mode;
  const inspectionSections = proposal.inspection_sections || proposalData.inspection_sections;
  const warrantyDetails = proposal.warranty_details || proposalData.warranty_details;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">Roof Replacement Proposal</CardTitle>
            <Badge variant={proposal.status === "sent" ? "default" : "secondary"}>
              {proposal.status}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-2">
            {proposalData.homeowner_name} • {proposalData.property_address}
          </div>
        </CardHeader>
      </Card>

      {/* Inspection Summary */}
      {inspectionSections && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Inspection Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{inspectionSections.inspection_summary}</p>

            {inspectionSections.what_we_found && inspectionSections.what_we_found.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">What We Found</h4>
                <div className="space-y-2">
                  {inspectionSections.what_we_found.map((finding: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                      {finding.photo_url && (
                        <ImageIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm">{finding.description}</p>
                        {finding.severity && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            {finding.severity}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Why Fix Now
              </h4>
              <p className="text-sm text-blue-900 dark:text-blue-100">
                {inspectionSections.why_fix_now}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Tiers - Good/Better/Best */}
      {pricingTiers && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Choose Your Option
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Select the option that best fits your needs and budget
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* GOOD */}
              <div
                className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedTier === "good"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-primary/50"
                }`}
                onClick={() => handleTierSelect("good")}
              >
                {selectedTier === "good" && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-lg">GOOD</h3>
                    <p className="text-xs text-muted-foreground">Economy Option</p>
                  </div>
                  <div className="text-2xl font-bold">
                    ${pricingTiers.good.price.toLocaleString()}
                  </div>
                  <p className="text-sm text-muted-foreground">{pricingTiers.good.description}</p>
                  <ul className="space-y-1 text-sm">
                    {pricingTiers.good.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* BETTER */}
              <div
                className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedTier === "better"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-primary/50"
                } ${pricingTiers.better.is_popular ? "ring-2 ring-primary/20" : ""}`}
                onClick={() => handleTierSelect("better")}
              >
                {pricingTiers.better.is_popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      <Star className="h-3 w-3 mr-1" />
                      Most Popular
                    </Badge>
                  </div>
                )}
                {selectedTier === "better" && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-lg">BETTER</h3>
                    <p className="text-xs text-muted-foreground">Most Popular</p>
                  </div>
                  <div className="text-2xl font-bold">
                    ${pricingTiers.better.price.toLocaleString()}
                  </div>
                  <p className="text-sm text-muted-foreground">{pricingTiers.better.description}</p>
                  <ul className="space-y-1 text-sm">
                    {pricingTiers.better.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* BEST */}
              <div
                className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all ${
                  selectedTier === "best"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-primary/50"
                }`}
                onClick={() => handleTierSelect("best")}
              >
                {selectedTier === "best" && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-lg">BEST</h3>
                    <p className="text-xs text-muted-foreground">Premium Option</p>
                  </div>
                  <div className="text-2xl font-bold">
                    ${pricingTiers.best.price.toLocaleString()}
                  </div>
                  <p className="text-sm text-muted-foreground">{pricingTiers.best.description}</p>
                  <ul className="space-y-1 text-sm">
                    {pricingTiers.best.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Options */}
      {upgradeOptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Optional Upgrades</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enhance your roof with these premium options
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upgradeOptions.map((upgrade) => {
                const isSelected = selectedUpgrades.has(upgrade.id);
                return (
                  <div
                    key={upgrade.id}
                    className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-all ${
                      isSelected ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                    }`}
                    onClick={() => handleUpgradeToggle(upgrade.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{upgrade.name}</h4>
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{upgrade.description}</p>
                    </div>
                    <div className="ml-4">
                      <div className="text-lg font-semibold">${upgrade.price.toLocaleString()}</div>
                      <Button
                        variant={isSelected ? "outline" : "default"}
                        size="sm"
                        className="mt-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpgradeToggle(upgrade.id);
                        }}
                      >
                        {isSelected ? (
                          <>
                            <Minus className="h-4 w-4 mr-1" />
                            Remove
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Total Price */}
      <Card className="bg-primary/5 border-primary">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Total Project Cost</div>
              <div className="text-3xl font-bold mt-1">${calculateTotal().toLocaleString()}</div>
              {selectedUpgrades.size > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  Includes {selectedUpgrades.size} upgrade{selectedUpgrades.size > 1 ? "s" : ""}
                </div>
              )}
            </div>
            {homeownerView && (
              <Button size="lg" className="text-lg px-8">
                Approve & Sign
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Financing Options */}
      {homeownerView && (
        <FinancingOptions
          amount={calculateTotal()}
          customerName={proposalData?.homeowner_name}
          customerAddress={proposalData?.property_address}
          compact={false}
        />
      )}

      {/* Warranty Details */}
      {warrantyDetails && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Warranty Protection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {warrantyDetails.workmanship_warranty && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="font-medium mb-2">
                  {warrantyDetails.workmanship_warranty.years}-Year Workmanship Warranty
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {warrantyDetails.workmanship_warranty.description}
                </p>
                <ul className="space-y-1 text-sm">
                  {warrantyDetails.workmanship_warranty.coverage?.map((item: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {warrantyDetails.manufacturer_warranty && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="font-medium mb-2">
                  {warrantyDetails.manufacturer_warranty.years}-Year Manufacturer Warranty
                </div>
                <p className="text-sm text-muted-foreground">
                  {warrantyDetails.manufacturer_warranty.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Insurance Mode */}
      {insuranceMode && insuranceMode.is_insurance_claim && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Insurance Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {insuranceMode.acv_vs_rcv && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="font-medium mb-2">ACV vs RCV</h4>
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  {insuranceMode.acv_vs_rcv.explanation}
                </p>
              </div>
            )}
            {insuranceMode.depreciation_logic && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Depreciation</h4>
                <p className="text-sm">{insuranceMode.depreciation_logic}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Proposal Text (Expandable) */}
      <Card>
        <CardHeader>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between"
          >
            <CardTitle className="text-lg">Full Proposal Details</CardTitle>
            {expanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </button>
        </CardHeader>
        {expanded && (
          <CardContent>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
              {proposal.proposal_text}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Actions (Contractor View) */}
      {!homeownerView && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(proposal.proposal_text)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Text
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSending(true)} disabled={sending}>
                <Mail className="h-4 w-4 mr-2" />
                {sending ? "Sending..." : "Send Email"}
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}















