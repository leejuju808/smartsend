/**
 * Financing Application Form Component
 * Collects customer information for soft pull pre-approval
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard, X } from "lucide-react";
import { toast } from "sonner";
import type { LenderOffer } from "@/lib/financing/lenders";

interface FinancingApplicationFormProps {
  jobId?: string;
  customerId?: string;
  amount: number;
  selectedOffer: LenderOffer;
  customerName?: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
  customerZip?: string;
  customerPhone?: string;
  customerEmail?: string;
  onComplete: (applicationId: string) => void;
  onCancel: () => void;
}

export function FinancingApplicationForm({
  jobId,
  customerId,
  amount,
  selectedOffer,
  customerName: initialName,
  customerAddress: initialAddress,
  customerCity: initialCity,
  customerState: initialState,
  customerZip: initialZip,
  customerPhone: initialPhone,
  customerEmail: initialEmail,
  onComplete,
  onCancel,
}: FinancingApplicationFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: initialName || "",
    address: initialAddress || "",
    city: initialCity || "",
    state: initialState || "",
    zip: initialZip || "",
    phone: initialPhone || "",
    email: initialEmail || "",
    ssnLast4: "",
    income: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name || !formData.address || !formData.city || !formData.state || !formData.zip) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/financing/soft-pull", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId,
          customerId,
          amount,
          customerName: formData.name,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
          ssnLast4: formData.ssnLast4 || undefined,
          income: formData.income ? parseFloat(formData.income) : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit application");
      }

      if (data.preApproved) {
        toast.success("You're Pre-Approved! 🎉");
        onComplete(data.applicationId);
      } else {
        toast.info("We found alternative financing options for you");
        onComplete(data.applicationId);
      }
    } catch (error: any) {
      console.error("Error submitting financing application:", error);
      toast.error(error.message || "Failed to submit application");
    } finally {
      setLoading(false);
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Apply for Financing
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Selected Plan Summary */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm font-medium text-blue-900 mb-2">Selected Plan:</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{selectedOffer.planName}</div>
              <div className="text-sm text-gray-600">
                {selectedOffer.termMonths} months
                {selectedOffer.apr > 0 && ` • ${selectedOffer.apr}% APR`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(selectedOffer.monthlyPayment)}
              </div>
              <div className="text-xs text-gray-500">/month</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="address">Street Address *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="state">State *</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                maxLength={2}
                placeholder="TX"
                required
              />
            </div>

            <div>
              <Label htmlFor="zip">ZIP Code *</Label>
              <Input
                id="zip"
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="ssnLast4">Last 4 of SSN (Optional)</Label>
              <Input
                id="ssnLast4"
                value={formData.ssnLast4}
                onChange={(e) => setFormData({ ...formData, ssnLast4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                maxLength={4}
                placeholder="1234"
              />
            </div>

            <div>
              <Label htmlFor="income">Annual Income (Optional)</Label>
              <Input
                id="income"
                type="number"
                value={formData.income}
                onChange={(e) => setFormData({ ...formData, income: e.target.value })}
                placeholder="50000"
              />
            </div>
          </div>

          <div className="pt-4 border-t">
            <div className="text-xs text-gray-500 mb-4">
              * This is a soft credit check and will not impact your credit score.
              Pre-approval is instant and takes just seconds.
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={loading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Get Pre-Approved
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}





















