"use client";

// Block 88000 — SmartSend Roofing Payments & Collections v1
// Payments Tab Component for Job Detail Page
// Shows invoices, payments, and payment management UI

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  DollarSign,
  FileText,
  ExternalLink,
  Send,
} from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";
import { format } from "date-fns";

interface JobPaymentsTabProps {
  jobId: string;
  orgId: string;
  homeownerName?: string;
  homeownerEmail?: string;
  jobValue?: number;
}

type Invoice = {
  id: string;
  invoice_number: string;
  invoice_type: "deposit" | "full" | "progress" | "change_order" | "supplement";
  amount_due: number;
  amount_paid: number;
  due_date: string | null;
  status: "pending" | "partial" | "paid" | "overdue" | "cancelled";
  homeowner_name: string;
  homeowner_email: string;
  created_at: string;
};

type Payment = {
  id: string;
  amount: number;
  payment_method: string;
  status: string;
  payer_name: string | null;
  payer_email: string | null;
  created_at: string;
  invoice_id: string | null;
};

type PaymentLink = {
  id: string;
  payment_url: string;
  link_type: string;
  is_active: boolean;
};

export function JobPaymentsTab({
  jobId,
  orgId,
  homeownerName,
  homeownerEmail,
  jobValue,
}: JobPaymentsTabProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<Record<string, PaymentLink>>({});
  const [loading, setLoading] = useState(true);
  const [requestingDeposit, setRequestingDeposit] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchPaymentsData();
  }, [jobId]);

  const fetchPaymentsData = async () => {
    try {
      setLoading(true);

      // Fetch invoices for this job
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("*")
        .eq("job_id", jobId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (invoicesError) throw invoicesError;
      setInvoices(invoicesData || []);

      // Fetch payments for this job
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("payments")
        .select("*")
        .eq("job_id", jobId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (paymentsError) throw paymentsError;
      setPayments(paymentsData || []);

      // Fetch payment links for invoices
      if (invoicesData && invoicesData.length > 0) {
        const invoiceIds = invoicesData.map((inv) => inv.id);
        const { data: linksData } = await supabase
          .from("payment_links")
          .select("*")
          .in("invoice_id", invoiceIds)
          .eq("is_active", true);

        if (linksData) {
          const linksMap: Record<string, PaymentLink> = {};
          linksData.forEach((link) => {
            linksMap[link.invoice_id] = link;
          });
          setPaymentLinks(linksMap);
        }
      }
    } catch (error) {
      console.error("Error fetching payments data:", error);
      toast.error("Failed to load payment data");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeposit = async (depositType: "50_percent" | "custom", customAmount?: number) => {
    if (!homeownerName || !homeownerEmail) {
      toast.error("Homeowner information is required");
      return;
    }

    try {
      setRequestingDeposit(true);

      const response = await fetch("/api/payments/deposit-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          homeowner_name: homeownerName,
          homeowner_email: homeownerEmail,
          deposit_type: depositType,
          amount: customAmount,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to request deposit");
      }

      const data = await response.json();
      toast.success("Deposit request created!");
      
      if (data.payment_link) {
        toast.info("Payment link ready", {
          description: "Share this link with the homeowner",
        });
      }

      await fetchPaymentsData();
    } catch (error: any) {
      console.error("Error requesting deposit:", error);
      toast.error(error.message || "Failed to request deposit");
    } finally {
      setRequestingDeposit(false);
    }
  };

  const handleCreatePaymentLink = async (invoiceId: string) => {
    try {
      const response = await fetch(
        `/api/payments/invoices/${invoiceId}/payment-link`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to create payment link");
      }

      const data = await response.json();
      toast.success("Payment link created!");
      
      // Refresh data
      await fetchPaymentsData();
    } catch (error: any) {
      console.error("Error creating payment link:", error);
      toast.error("Failed to create payment link");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Paid
          </Badge>
        );
      case "overdue":
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Overdue
          </Badge>
        );
      case "partial":
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Partial
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        );
    }
  };

  const getInvoiceTypeLabel = (type: string) => {
    switch (type) {
      case "deposit":
        return "Deposit";
      case "progress":
        return "Progress Payment";
      case "full":
        return "Full Invoice";
      case "change_order":
        return "Change Order";
      case "supplement":
        return "Supplement";
      default:
        return "Invoice";
    }
  };

  const totalInvoiced = invoices.reduce(
    (sum, i) => sum + Number(i.amount_due),
    0
  );
  const totalPaid = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = totalInvoiced - totalPaid;

  if (loading) {
    return <div className="p-4">Loading payments...</div>;
  }

  const depositAmount = jobValue ? jobValue * 0.5 : 0;

  return (
    <div className="space-y-6">
      {/* Quick Actions - Deposit Request Buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => handleRequestDeposit("50_percent")}
              disabled={requestingDeposit || !homeownerName || !homeownerEmail}
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Request 50% Deposit
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const amount = prompt("Enter custom deposit amount:");
                if (amount && parseFloat(amount) > 0) {
                  handleRequestDeposit("custom", parseFloat(amount));
                }
              }}
              disabled={requestingDeposit || !homeownerName || !homeownerEmail}
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Request Custom Amount
            </Button>
            <Link href={`/payments/new?job_id=${jobId}`}>
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Create Full Invoice
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Invoiced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalInvoiced)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalPaid)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Balance Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                balance > 0 ? "text-orange-600" : "text-gray-600"
              }`}
            >
              {formatCurrency(balance)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-gray-500">No invoices yet.</p>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => {
                const paymentLink = paymentLinks[invoice.id];
                const amountRemaining = invoice.amount_due - invoice.amount_paid;

                return (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {getInvoiceTypeLabel(invoice.invoice_type)} - {invoice.invoice_number}
                        </span>
                        {getStatusBadge(invoice.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(invoice.amount_due)}
                        </span>
                        {invoice.amount_paid > 0 && (
                          <span className="text-green-600">
                            Paid: {formatCurrency(invoice.amount_paid)}
                          </span>
                        )}
                        {amountRemaining > 0 && (
                          <span className="text-orange-600">
                            Due: {formatCurrency(amountRemaining)}
                          </span>
                        )}
                        {invoice.due_date && (
                          <span>
                            Due: {format(new Date(invoice.due_date), "MMM d, yyyy")}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {format(new Date(invoice.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {paymentLink ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(paymentLink.payment_url, "_blank")}
                        >
                          <Send className="w-4 h-4 mr-1" />
                          Send Link
                        </Button>
                      ) : amountRemaining > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCreatePaymentLink(invoice.id)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Create Link
                        </Button>
                      ) : null}
                      <Link href={`/payments/invoices/${invoice.id}`}>
                        <Button variant="outline" size="sm">
                          View
                          <ExternalLink className="w-4 h-4 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-gray-500">No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <span className="font-medium">
                      {formatCurrency(Number(payment.amount))}
                    </span>
                    <span className="text-sm text-gray-500 ml-2">
                      via {payment.payment_method.charAt(0).toUpperCase() + payment.payment_method.slice(1)}
                    </span>
                    {payment.payer_name && (
                      <span className="text-sm text-gray-500 ml-2">
                        • {payment.payer_name}
                      </span>
                    )}
                    <Badge
                      variant={
                        payment.status === "succeeded"
                          ? "default"
                          : payment.status === "failed"
                          ? "destructive"
                          : "outline"
                      }
                      className="ml-2"
                    >
                      {payment.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-500">
                    {format(new Date(payment.created_at), "MMM d, yyyy")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
