/**
 * Homeowner Financing Portal Component
 * Shows financing options, approval status, payment terms, documents, lender info
 */

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Download,
  Loader2,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";

interface HomeownerFinancingPortalProps {
  applicationId: string;
  customerId?: string;
}

interface FinancingApplication {
  id: string;
  status: string;
  amount_requested: number;
  lender: string;
  lender_application_id: string;
  created_at: string;
  financing_offers: Array<{
    id: string;
    plan_name: string;
    monthly_payment: number;
    term_months: number;
    apr: number;
    same_as_cash: boolean;
    total_amount: number;
    lender: string;
    is_available: boolean;
    is_recommended: boolean;
  }>;
  financing_events: Array<{
    id: string;
    event_type: string;
    message: string;
    created_at: string;
  }>;
}

export function HomeownerFinancingPortal({
  applicationId,
  customerId,
}: HomeownerFinancingPortalProps) {
  const [application, setApplication] = useState<FinancingApplication | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApplication();
  }, [applicationId]);

  const loadApplication = async () => {
    try {
      const response = await fetch(`/api/financing/applications/${applicationId}`);
      const data = await response.json();
      if (data.success) {
        setApplication(data.application);
      }
    } catch (error) {
      console.error("Error loading financing application:", error);
      toast.error("Failed to load financing information");
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

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: any; icon: any }> = {
      pending: {
        label: "Pending",
        variant: "secondary",
        icon: Clock,
      },
      pre_approved: {
        label: "Pre-Approved",
        variant: "default",
        icon: CheckCircle,
      },
      approved: {
        label: "Approved",
        variant: "default",
        icon: CheckCircle,
      },
      denied: {
        label: "Denied",
        variant: "destructive",
        icon: XCircle,
      },
      expired: {
        label: "Expired",
        variant: "secondary",
        icon: Clock,
      },
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!application) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            Financing application not found
          </div>
        </CardContent>
      </Card>
    );
  }

  const approvedOffers = application.financing_offers?.filter((o) => o.is_available) || [];
  const selectedOffer = approvedOffers.find((o) => o.is_recommended) || approvedOffers[0];

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Financing Application
            </CardTitle>
            {getStatusBadge(application.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">Amount Requested</div>
              <div className="text-xl font-bold">{formatCurrency(application.amount_requested)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Application ID</div>
              <div className="text-sm font-mono">{application.id.slice(0, 8)}...</div>
            </div>
          </div>

          {application.lender && (
            <div>
              <div className="text-sm text-gray-500">Lender</div>
              <div className="font-medium">{application.lender}</div>
            </div>
          )}

          {application.status === "approved" && selectedOffer && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-900">Your Financing is Approved!</span>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Plan:</span> {selectedOffer.plan_name}
                </div>
                <div>
                  <span className="font-medium">Monthly Payment:</span>{" "}
                  {formatCurrency(selectedOffer.monthly_payment)}/month
                </div>
                <div>
                  <span className="font-medium">Term:</span> {selectedOffer.term_months} months
                </div>
                {selectedOffer.apr > 0 && (
                  <div>
                    <span className="font-medium">APR:</span> {selectedOffer.apr}%
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Offers */}
      {approvedOffers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Financing Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {approvedOffers.map((offer) => (
                <div
                  key={offer.id}
                  className={`p-4 border rounded-lg ${
                    offer.is_recommended
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{offer.plan_name}</span>
                        {offer.is_recommended && (
                          <Badge variant="default">Recommended</Badge>
                        )}
                        {offer.same_as_cash && (
                          <Badge variant="outline">0% APR</Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {offer.term_months} months
                        {offer.apr > 0 && ` • ${offer.apr}% APR`}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold">
                        {formatCurrency(offer.monthly_payment)}
                      </div>
                      <div className="text-xs text-gray-500">/month</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {application.financing_events && application.financing_events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Application Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {application.financing_events
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                )
                .map((event) => (
                  <div key={event.id} className="flex items-start gap-3">
                    <div className="mt-1">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{event.message}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(event.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
        </CardHeader>
        <CardContent>
          {application.status === "approved" ? (
            <div className="space-y-2">
              <p className="text-sm">
                Your financing has been approved! Your roof installation will now be scheduled.
              </p>
              <p className="text-sm text-gray-600">
                You will receive updates about your project schedule and payment details via email.
              </p>
            </div>
          ) : application.status === "pre_approved" ? (
            <div className="space-y-2">
              <p className="text-sm">
                You're pre-approved! Select a financing plan above to complete your application.
              </p>
            </div>
          ) : application.status === "denied" ? (
            <div className="space-y-2">
              <p className="text-sm">
                We found alternative financing options that may work for your budget. Our team will
                contact you with details.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">Your application is being processed.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}





















