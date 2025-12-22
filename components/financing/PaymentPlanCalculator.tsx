/**
 * Payment Plan Calculator Component
 * Shows monthly payment options for any job amount
 */

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/input";
import { DollarSign, CreditCard, CheckCircle, TrendingUp } from "lucide-react";
import type { LenderOffer } from "@/lib/financing/lenders";
import { getLenderDisplayName } from "@/lib/financing/lenders";

interface PaymentPlanCalculatorProps {
  amount: number;
  onAmountChange?: (amount: number) => void;
  onSelectPlan?: (offer: LenderOffer) => void;
  showApplyButton?: boolean;
  compact?: boolean;
}

export function PaymentPlanCalculator({
  amount: initialAmount,
  onAmountChange,
  onSelectPlan,
  showApplyButton = true,
  compact = false,
}: PaymentPlanCalculatorProps) {
  const [amount, setAmount] = useState(initialAmount.toString());
  const [options, setOptions] = useState<LenderOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<LenderOffer | null>(null);

  useEffect(() => {
    if (initialAmount > 0) {
      loadOptions(initialAmount);
    }
  }, [initialAmount]);

  const loadOptions = async (amt: number) => {
    if (amt <= 0) {
      setOptions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/financing/options?amount=${amt}`);
      const data = await response.json();
      if (data.success) {
        setOptions(data.options || []);
      }
    } catch (error) {
      console.error("Error loading financing options:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    const numValue = parseFloat(value) || 0;
    if (onAmountChange) {
      onAmountChange(numValue);
    }
    if (numValue > 0) {
      loadOptions(numValue);
    }
  };

  const handleSelectPlan = (offer: LenderOffer) => {
    setSelectedPlan(offer);
    if (onSelectPlan) {
      onSelectPlan(offer);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (compact) {
    return (
      <div className="space-y-3">
        {options.map((offer, index) => (
          <div
            key={index}
            className={`p-4 border rounded-lg cursor-pointer transition-all ${
              selectedPlan?.planName === offer.planName
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
            onClick={() => handleSelectPlan(offer)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">{offer.planName}</div>
                <div className="text-xs text-gray-500">
                  {offer.termMonths} months
                  {offer.apr > 0 && ` • ${offer.apr}% APR`}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-lg">
                  {formatCurrency(offer.monthlyPayment)}
                </div>
                <div className="text-xs text-gray-500">/month</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Options
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {onAmountChange && (
          <div>
            <label className="text-sm font-medium mb-2 block">
              Job Amount
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="Enter amount"
                className="pl-10"
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading options...</div>
        ) : options.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Enter an amount to see payment options
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm font-medium mb-2">Available Plans:</div>
            {options.map((offer, index) => (
              <div
                key={index}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedPlan?.planName === offer.planName
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                } ${offer.isRecommended ? "ring-2 ring-blue-200" : ""}`}
                onClick={() => handleSelectPlan(offer)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{offer.planName}</span>
                      {offer.isRecommended && (
                        <Badge variant="default" className="text-xs">
                          Recommended
                        </Badge>
                      )}
                      {offer.sameAsCash && (
                        <Badge variant="outline" className="text-xs">
                          0% APR
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {offer.termMonths} months
                      {offer.apr > 0 && ` • ${offer.apr}% APR`}
                      {offer.apr === 0 && " • Same-as-Cash"}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Lender: {getLenderDisplayName(offer.lender)}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-2xl font-bold">
                      {formatCurrency(offer.monthlyPayment)}
                    </div>
                    <div className="text-xs text-gray-500">/month</div>
                  </div>
                </div>
                {showApplyButton && selectedPlan?.planName === offer.planName && (
                  <Button
                    className="w-full mt-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectPlan(offer);
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Select This Plan
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="pt-4 border-t text-xs text-gray-500">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3" />
            <span>Financing increases close rate by 20-40%</span>
          </div>
          <div>
            * Pre-approval available with soft credit check (no impact on credit
            score)
          </div>
        </div>
      </CardContent>
    </Card>
  );
}





















