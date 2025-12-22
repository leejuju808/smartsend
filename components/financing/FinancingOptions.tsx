/**
 * Financing Options Display Component
 * Shows financing options on proposals with apply buttons
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  CreditCard,
  CheckCircle,
  DollarSign,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { LenderOffer } from "@/lib/financing/lenders";
import { getLenderDisplayName } from "@/lib/financing/lenders";
import { FinancingApplicationForm } from "./FinancingApplicationForm";

interface FinancingOptionsProps {
  jobId?: string;
  customerId?: string;
  amount: number;
  customerName?: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
  customerZip?: string;
  customerPhone?: string;
  customerEmail?: string;
  onApplicationCreated?: (applicationId: string) => void;
  compact?: boolean;
}

export function FinancingOptions({
  jobId,
  customerId,
  amount,
  customerName,
  customerAddress,
  customerCity,
  customerState,
  customerZip,
  customerPhone,
  customerEmail,
  onApplicationCreated,
  compact = false,
}: FinancingOptionsProps) {
  const [options, setOptions] = useState<LenderOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<LenderOffer | null>(null);

  // Load options on mount
  useState(() => {
    loadOptions();
  });

  const loadOptions = async () => {
    if (amount <= 0) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/financing/options?amount=${amount}`);
      const data = await response.json();
      if (data.success) {
        setOptions(data.options || []);
      }
    } catch (error) {
      console.error("Error loading financing options:", error);
      toast.error("Failed to load financing options");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (offer: LenderOffer) => {
    setSelectedOffer(offer);
    setShowApplicationForm(true);
  };

  const handleApplicationComplete = (applicationId: string) => {
    setShowApplicationForm(false);
    if (onApplicationCreated) {
      onApplicationCreated(applicationId);
    }
    toast.success("Financing application submitted!");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (showApplicationForm && selectedOffer) {
    return (
      <FinancingApplicationForm
        jobId={jobId}
        customerId={customerId}
        amount={amount}
        selectedOffer={selectedOffer}
        customerName={customerName}
        customerAddress={customerAddress}
        customerCity={customerCity}
        customerState={customerState}
        customerZip={customerZip}
        customerPhone={customerPhone}
        customerEmail={customerEmail}
        onComplete={handleApplicationComplete}
        onCancel={() => setShowApplicationForm(false)}
      />
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold mb-2">Payment Options:</div>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <div className="p-3 border rounded-lg bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Pay in Full</span>
                <span className="font-bold">{formatCurrency(amount)}</span>
              </div>
            </div>
            {options.slice(0, 3).map((offer, index) => (
              <div
                key={index}
                className="p-3 border rounded-lg hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium">{offer.planName}</div>
                    <div className="text-xs text-gray-500">
                      {offer.termMonths} months
                      {offer.apr > 0 && ` • ${offer.apr}% APR`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatCurrency(offer.monthlyPayment)}</div>
                    <div className="text-xs text-gray-500">/month</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleApply(offer)}
                >
                  Apply Now
                </Button>
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">Choose Your Payment Option</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Pay in Full Option */}
            <div className="p-4 border-2 border-gray-300 rounded-lg bg-white hover:border-gray-400 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">Pay in Full</div>
                  <div className="text-sm text-gray-600">One-time payment</div>
                </div>
                <div className="text-2xl font-bold">{formatCurrency(amount)}</div>
              </div>
            </div>

            {/* Financing Options */}
            {options.map((offer, index) => (
              <div
                key={index}
                className={`p-4 border-2 rounded-lg bg-white transition-all ${
                  offer.isRecommended
                    ? "border-blue-500 ring-2 ring-blue-200"
                    : "border-gray-300 hover:border-blue-400"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-lg">{offer.planName}</span>
                      {offer.isRecommended && (
                        <Badge className="bg-blue-600">Best Value</Badge>
                      )}
                      {offer.sameAsCash && (
                        <Badge variant="outline" className="border-green-500 text-green-700">
                          0% APR
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mb-1">
                      {offer.termMonths} months
                      {offer.apr > 0 && ` • ${offer.apr}% APR`}
                      {offer.apr === 0 && " • Same-as-Cash"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {getLenderDisplayName(offer.lender)}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-3xl font-bold text-blue-600">
                      {formatCurrency(offer.monthlyPayment)}
                    </div>
                    <div className="text-sm text-gray-500">/month</div>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => handleApply(offer)}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Apply for {offer.planName}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-3 bg-blue-100 rounded-lg">
          <div className="flex items-start gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-xs text-blue-800">
              <strong>Instant Pre-Approval Available</strong> - Soft credit check
              (no impact on credit score). Get approved in seconds!
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}





















