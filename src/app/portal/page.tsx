"use client";

// Block 38900 — SmartSend Roofing Customer Portal + Live Job Tracker v1
// Public homeowner portal accessible via magic link token

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Home,
  Calendar,
  Image as ImageIcon,
  FileText,
  DollarSign,
  CreditCard,
  Download,
  CheckCircle,
  Clock,
  Package,
  MessageSquare,
  Star,
  Users,
  Loader2,
  AlertCircle,
} from "lucide-react";

type PortalData = {
  job: {
    id: string;
    stage: string;
    contract_value: number | null;
    insurance: boolean;
    notes: string | null;
    progress_percent: number;
    created_at: string;
    updated_at: string;
  };
  lead: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  };
  timeline: Array<{
    id: string;
    stage: string;
    changed_at: string;
  }>;
  materials: Array<{
    id: string;
    supplier: string | null;
    material_type: string | null;
    ordered_at: string | null;
    eta: string | null;
    delivered: boolean;
    notes: string | null;
  }>;
  photos: Array<{
    id: string;
    photo_url: string;
    label: "before" | "during" | "after" | null;
    created_at: string;
  }>;
  change_orders: Array<{
    id: string;
    description: string;
    amount: number;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    change_order_photos: Array<{
      id: string;
      photo_url: string;
      label: string | null;
    }>;
  }>;
  invoices: Array<{
    id: string;
    type: "deposit" | "final" | "change_order";
    amount: number;
    status: string;
    due_date: string | null;
    stripe_payment_link: string | null;
    created_at: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    status: string;
    received_at: string | null;
    created_at: string;
  }>;
  schedule: {
    id: string;
    crew_name: string | null;
    start_date: string | null;
    duration_days: number | null;
    notes: string | null;
  } | null;
};

const STAGE_LABELS: Record<string, string> = {
  estimate: "Estimate Sent",
  approved: "Approved",
  insurance: "Insurance",
  materials: "Materials Ordered",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
};

const STAGE_COLORS: Record<string, string> = {
  estimate: "bg-gray-100 text-gray-800",
  approved: "bg-blue-100 text-blue-800",
  insurance: "bg-purple-100 text-purple-800",
  materials: "bg-yellow-100 text-yellow-800",
  scheduled: "bg-orange-100 text-orange-800",
  in_progress: "bg-green-100 text-green-800",
  completed: "bg-emerald-100 text-emerald-800",
};

export default function PortalPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing portal token");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/portal/data?token=${token}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to load portal");
        }

        const portalData = await response.json();
        setData(portalData);
      } catch (err: any) {
        console.error("Error fetching portal data:", err);
        setError(err.message || "Failed to load portal");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Unable to Load Portal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              {error ||
                "The portal link is invalid or has expired. Please contact your roofing company for a new link."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { job, lead, timeline, materials, photos, change_orders, invoices, payments, schedule } = data;

  // Calculate balance
  const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
  const totalPaid = payments.reduce((sum, pay) => sum + Number(pay.amount), 0);
  const balance = totalInvoiced - totalPaid;

  // Group photos by label
  const photosByLabel = {
    before: photos.filter((p) => p.label === "before"),
    during: photos.filter((p) => p.label === "during"),
    after: photos.filter((p) => p.label === "after"),
    other: photos.filter((p) => !p.label || !["before", "during", "after"].includes(p.label)),
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Your Project Portal</h1>
              <p className="text-sm text-gray-600 mt-1">
                {lead.first_name && lead.last_name
                  ? `${lead.first_name} ${lead.last_name}`
                  : lead.email || "Homeowner"}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="#documents">
                <Download className="h-4 w-4 mr-2" />
                Download Documents
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Project Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Project Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Job Progress</span>
                <span className="text-sm font-semibold text-gray-900">{job.progress_percent}%</span>
              </div>
              <Progress value={job.progress_percent} className="h-3" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Current Stage</p>
                <Badge className={STAGE_COLORS[job.stage] || "bg-gray-100 text-gray-800"}>
                  {STAGE_LABELS[job.stage] || job.stage}
                </Badge>
              </div>
              {schedule?.start_date && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Start Date</p>
                  <p className="text-sm font-medium">
                    {new Date(schedule.start_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {schedule?.crew_name && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Crew</p>
                  <p className="text-sm font-medium">{schedule.crew_name}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 mb-1">Materials</p>
                <p className="text-sm font-medium">
                  {materials.some((m) => m.delivered) ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      Delivered
                    </span>
                  ) : materials.length > 0 ? (
                    <span className="text-yellow-600 flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Pending
                    </span>
                  ) : (
                    "Not Ordered"
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Project Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {timeline.map((event, index) => (
                <div key={event.id} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        index === timeline.length - 1 ? "bg-blue-600" : "bg-gray-300"
                      }`}
                    />
                    {index < timeline.length - 1 && (
                      <div className="w-0.5 h-8 bg-gray-200 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="font-medium text-gray-900">
                      {STAGE_LABELS[event.stage] || event.stage}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(event.changed_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Photos */}
        {photos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Project Photos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {photosByLabel.before.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Before</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {photosByLabel.before.map((photo) => (
                        <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden">
                          <img
                            src={photo.photo_url}
                            alt="Before"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {photosByLabel.during.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">During Installation</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {photosByLabel.during.map((photo) => (
                        <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden">
                          <img
                            src={photo.photo_url}
                            alt="During"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {photosByLabel.after.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">After</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {photosByLabel.after.map((photo) => (
                        <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden">
                          <img
                            src={photo.photo_url}
                            alt="After"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Change Orders */}
        {change_orders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Change Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {change_orders.map((co) => (
                  <div key={co.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{co.description}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          ${Number(co.amount).toLocaleString()}
                        </p>
                      </div>
                      <Badge
                        className={
                          co.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : co.status === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }
                      >
                        {co.status.charAt(0).toUpperCase() + co.status.slice(1)}
                      </Badge>
                    </div>
                    {co.change_order_photos && co.change_order_photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        {co.change_order_photos.map((photo) => (
                          <img
                            key={photo.id}
                            src={photo.photo_url}
                            alt={photo.label || "Change order photo"}
                            className="w-full h-24 object-cover rounded"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Current Balance</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    ${balance.toLocaleString()}
                  </p>
                </div>
                {balance > 0 && invoices.some((inv) => inv.stripe_payment_link) && (
                  <Button asChild>
                    <a
                      href={
                        invoices.find((inv) => inv.stripe_payment_link && inv.status !== "paid")
                          ?.stripe_payment_link || "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Pay Now
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {invoices.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Invoices</h3>
                <div className="space-y-2">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {invoice.type.charAt(0).toUpperCase() + invoice.type.slice(1)} Invoice
                        </p>
                        <p className="text-sm text-gray-600">
                          ${Number(invoice.amount).toLocaleString()}
                          {invoice.due_date && ` • Due ${new Date(invoice.due_date).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Badge
                        className={
                          invoice.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : invoice.status === "overdue"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }
                      >
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {payments.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment History</h3>
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          ${Number(payment.amount).toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-600">
                          {payment.received_at
                            ? new Date(payment.received_at).toLocaleDateString()
                            : new Date(payment.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className="bg-green-100 text-green-800">Paid</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financing Section */}
        {job.contract_value && job.contract_value > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Financing Options
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Explore financing options to make your project more affordable.
              </p>
              <div className="space-y-3">
                <div className="border rounded-lg p-4">
                  <p className="font-medium text-gray-900 mb-2">Monthly Payment Estimate</p>
                  <p className="text-2xl font-bold text-gray-900 mb-2">
                    ${Math.round(Number(job.contract_value) / 60).toLocaleString()}/mo
                  </p>
                  <p className="text-xs text-gray-500">Estimated for 60-month term</p>
                </div>
                <Button variant="outline" className="w-full">
                  View Financing Plans
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Documents Section */}
        <Card id="documents">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document Vault
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Download all project documents, contracts, and certificates.
            </p>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" asChild>
                <a href="#" download>
                  <Download className="h-4 w-4 mr-2" />
                  Proposal
                </a>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <a href="#" download>
                  <Download className="h-4 w-4 mr-2" />
                  Contract
                </a>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <a href="#" download>
                  <Download className="h-4 w-4 mr-2" />
                  Warranty Documents
                </a>
              </Button>
              {invoices.map((invoice) => (
                <Button key={invoice.id} variant="outline" className="w-full justify-start" asChild>
                  <a href="#" download>
                    <Download className="h-4 w-4 mr-2" />
                    Invoice #{invoice.id.slice(0, 8)}
                  </a>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Review & Referral */}
        {job.stage === "completed" && (
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                Share Your Experience
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-700 mb-3">
                  We hope you&apos;re happy with your new roof! Your feedback helps us serve you better.
                </p>
                <div className="flex gap-2">
                  <Button>
                    <Star className="h-4 w-4 mr-2" />
                    Rate Your Experience
                  </Button>
                  <Button variant="outline">
                    <Users className="h-4 w-4 mr-2" />
                    Refer a Friend
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Questions about your project? Contact your project manager or crew directly.
            </p>
            {schedule?.crew_name && (
              <p className="text-sm text-gray-900 mt-2">
                <span className="font-medium">Crew:</span> {schedule.crew_name}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
































