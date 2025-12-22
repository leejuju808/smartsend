// Block 40850 — SmartSend Roofing "AI Proposal Engine + Dynamic Estimate Builder" v1
// Proposal Viewer Component (Homeowner View)

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check,
  Star,
  Shield,
  Clock,
  TrendingUp,
  DollarSign,
  FileText,
  PenTool,
  Calculator,
  Share2,
} from "lucide-react";
import { toast } from "sonner";

interface ProposalViewerProps {
  token: string;
  onSigned?: (proposalId: string, selectedOption: string) => void;
}

export function ProposalViewer({ token, onSigned }: ProposalViewerProps) {
  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<"good" | "better" | "best">("better");
  const [showFinancing, setShowFinancing] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [signature, setSignature] = useState("");
  const [signerName, setSignerName] = useState("");

  useEffect(() => {
    loadProposal();
  }, [token]);

  useEffect(() => {
    // Track proposal view
    if (proposal) {
      trackEvent("viewed", {});
    }
  }, [proposal]);

  const loadProposal = async () => {
    try {
      const response = await fetch(`/api/proposals/view/${token}`);
      if (!response.ok) {
        throw new Error("Proposal not found");
      }
      const data = await response.json();
      setProposal(data.proposal);
    } catch (error) {
      console.error("Error loading proposal:", error);
      toast.error("Failed to load proposal");
    } finally {
      setLoading(false);
    }
  };

  const trackEvent = async (eventType: string, metadata: any) => {
    if (!proposal) return;

    try {
      await fetch(`/api/proposals/${proposal.id}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          metadata,
        }),
      });
    } catch (error) {
      console.error("Error tracking event:", error);
    }
  };

  const handlePackageClick = (tier: "good" | "better" | "best") => {
    setSelectedOption(tier);
    trackEvent("package_clicked", { package: tier });
  };

  const handleSectionView = (section: string) => {
    trackEvent("section_viewed", { section });
  };

  const handleApproveProposal = async () => {
    if (!proposal || !signerName) {
      toast.error("Please enter your name to approve");
      return;
    }

    try {
      const response = await fetch(`/api/proposals/${proposal.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_option: selectedOption,
          signer_name: signerName,
          signature: signature || signerName, // Use typed signature if no drawn signature
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to approve proposal");
      }

      trackEvent("approved", { selected_option: selectedOption });
      toast.success("Proposal approved successfully!");
      
      if (onSigned) {
        onSigned(proposal.id, selectedOption);
      }
    } catch (error: any) {
      console.error("Error approving proposal:", error);
      toast.error(error.message || "Failed to approve proposal");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your proposal...</p>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Proposal not found or has expired.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const goodOption = proposal.good_option || {};
  const betterOption = proposal.better_option || {};
  const bestOption = proposal.best_option || {};

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Your Roofing Proposal</h1>
          <p className="text-lg text-muted-foreground">
            Choose the option that works best for your home
          </p>
        </div>

        {/* Package Comparison Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <PackageCard
            tier="good"
            option={goodOption}
            isSelected={selectedOption === "good"}
            onClick={() => handlePackageClick("good")}
          />
          <PackageCard
            tier="better"
            option={betterOption}
            isSelected={selectedOption === "better"}
            isPopular
            onClick={() => handlePackageClick("better")}
          />
          <PackageCard
            tier="best"
            option={bestOption}
            isSelected={selectedOption === "best"}
            onClick={() => handlePackageClick("best")}
          />
        </div>

        {/* Selected Option Details */}
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedOption === "good" && "Good Option Details"}
              {selectedOption === "better" && "Better Option Details"}
              {selectedOption === "best" && "Best Option Details"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview" onValueChange={(v) => handleSectionView(v)}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="materials">Materials</TabsTrigger>
                <TabsTrigger value="warranty">Warranty</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-6">
                <OptionDetails option={proposal[`${selectedOption}_option`]} />
              </TabsContent>
              <TabsContent value="materials" className="mt-6">
                <MaterialsSection option={proposal[`${selectedOption}_option`]} />
              </TabsContent>
              <TabsContent value="warranty" className="mt-6">
                <WarrantySection option={proposal[`${selectedOption}_option`]} />
              </TabsContent>
              <TabsContent value="timeline" className="mt-6">
                <TimelineSection option={proposal[`${selectedOption}_option`]} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Financing Calculator */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Financing Options
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FinancingCalculator
              price={proposal[`${selectedOption}_option`]?.price || 0}
              onCalculate={() => {
                setShowFinancing(true);
                trackEvent("financing_calculator_used", {});
              }}
            />
          </CardContent>
        </Card>

        {/* E-Signature Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenTool className="h-5 w-5" />
              Approve Proposal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Signature</label>
              <input
                type="text"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Type your signature"
              />
            </div>

            <Button
              onClick={handleApproveProposal}
              className="w-full"
              size="lg"
              disabled={!signerName}
            >
              <Check className="mr-2 h-5 w-5" />
              Approve {selectedOption.charAt(0).toUpperCase() + selectedOption.slice(1)} Option
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              By approving, you agree to the terms and conditions of this proposal.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PackageCard({
  tier,
  option,
  isSelected,
  isPopular,
  onClick,
}: {
  tier: string;
  option: any;
  isSelected: boolean;
  isPopular?: boolean;
  onClick: () => void;
}) {
  const tierNames = {
    good: "Good",
    better: "Better",
    best: "Best",
  };

  return (
    <Card
      className={`cursor-pointer transition-all ${
        isSelected ? "ring-2 ring-primary shadow-lg" : ""
      } ${isPopular ? "border-primary" : ""}`}
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{tierNames[tier as keyof typeof tierNames]}</CardTitle>
          {isPopular && (
            <Badge variant="default" className="bg-primary">
              Most Popular
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold mb-4">
          ${option?.price?.toLocaleString() || "0"}
        </div>
        {option?.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
            {option.description}
          </p>
        )}
        {isSelected && (
          <div className="flex items-center gap-2 text-primary">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">Selected</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OptionDetails({ option }: { option: any }) {
  if (!option) return null;

  return (
    <div className="space-y-4">
      {option.description && (
        <div>
          <h3 className="font-semibold mb-2">Description</h3>
          <p className="text-muted-foreground whitespace-pre-wrap">{option.description}</p>
        </div>
      )}
      {option.value_explanation && (
        <div>
          <h3 className="font-semibold mb-2">Why This Option</h3>
          <p className="text-muted-foreground">{option.value_explanation}</p>
        </div>
      )}
      {option.scope_of_work && (
        <div>
          <h3 className="font-semibold mb-2">Scope of Work</h3>
          <p className="text-muted-foreground whitespace-pre-wrap">{option.scope_of_work}</p>
        </div>
      )}
    </div>
  );
}

function MaterialsSection({ option }: { option: any }) {
  if (!option) return null;

  return (
    <div className="space-y-4">
      {option.materials && (
        <div>
          <h3 className="font-semibold mb-2">Materials Included</h3>
          <p className="text-muted-foreground">{option.materials}</p>
        </div>
      )}
    </div>
  );
}

function WarrantySection({ option }: { option: any }) {
  if (!option) return null;

  return (
    <div className="space-y-4">
      {option.warranty && (
        <div>
          <h3 className="font-semibold mb-2">Warranty Coverage</h3>
          <p className="text-muted-foreground">{option.warranty}</p>
        </div>
      )}
    </div>
  );
}

function TimelineSection({ option }: { option: any }) {
  if (!option) return null;

  return (
    <div className="space-y-4">
      {option.timeline && (
        <div>
          <h3 className="font-semibold mb-2">Project Timeline</h3>
          <p className="text-muted-foreground">{option.timeline}</p>
        </div>
      )}
    </div>
  );
}

function FinancingCalculator({ price, onCalculate }: { price: number; onCalculate: () => void }) {
  const [monthlyPayment, setMonthlyPayment] = useState<number | null>(null);
  const [term, setTerm] = useState<number>(36);
  const [apr, setApr] = useState<number>(8.99);

  const calculatePayment = () => {
    const monthlyRate = apr / 100 / 12;
    const payment = (price * monthlyRate * Math.pow(1 + monthlyRate, term)) /
      (Math.pow(1 + monthlyRate, term) - 1);
    setMonthlyPayment(payment);
    onCalculate();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Loan Term (months)</label>
          <select
            value={term}
            onChange={(e) => setTerm(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded-md"
          >
            <option value={12}>12 months</option>
            <option value={24}>24 months</option>
            <option value={36}>36 months</option>
            <option value={48}>48 months</option>
            <option value={60}>60 months</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">APR (%)</label>
          <input
            type="number"
            value={apr}
            onChange={(e) => setApr(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded-md"
            step="0.01"
          />
        </div>
      </div>

      <Button onClick={calculatePayment} className="w-full">
        Calculate Monthly Payment
      </Button>

      {monthlyPayment && (
        <div className="p-4 bg-primary/10 rounded-lg">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Estimated Monthly Payment</p>
            <p className="text-3xl font-bold text-primary">
              ${monthlyPayment.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Based on {term} months at {apr}% APR
            </p>
          </div>
        </div>
      )}

      <Button variant="outline" className="w-full">
        Apply for Financing
      </Button>
    </div>
  );
}
































