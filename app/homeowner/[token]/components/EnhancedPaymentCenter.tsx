"use client";

// Block 240000 — SmartSend Roofing Billing & Payments Hub
// Enhanced Payment Center with payment methods, auto-pay, and payment plans

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Plus,
  Trash2,
  Download,
  Calendar,
  DollarSign,
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

type Invoice = {
  id: string;
  invoice_number: string;
  type: "deposit" | "progress" | "final" | "change_order";
  amount: number;
  balance_due: number;
  due_date: string | null;
  status: "pending" | "partially_paid" | "paid" | "overdue" | "canceled";
  created_at: string;
};

type PaymentMethod = {
  id: string;
  type: "card" | "ach";
  last4: string;
  brand?: string;
  exp_month?: number;
  exp_year?: number;
  bank_name?: string;
  is_default: boolean;
};

type PaymentPlan = {
  id: string;
  total_amount: number;
  num_payments: number;
  schedule: Array<{
    date: string;
    amount: number;
    status: "pending" | "paid";
    installment_number: number;
  }>;
  auto_pay: boolean;
  status: "active" | "completed" | "cancelled" | "overdue";
};

interface EnhancedPaymentCenterProps {
  homeownerId: string;
  workspaceId: string;
}

export function EnhancedPaymentCenter({ homeownerId, workspaceId }: EnhancedPaymentCenterProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);

  useEffect(() => {
    loadData();
  }, [homeownerId, workspaceId]);

  const loadData = async () => {
    try {
      // Load invoices
      const invoicesRes = await fetch(`/api/billing/invoices?homeowner_id=${homeownerId}`);
      const invoicesData = await invoicesRes.json();
      setInvoices(invoicesData.invoices || []);

      // Load payment methods
      const methodsRes = await fetch(`/api/billing/payment-methods?homeowner_id=${homeownerId}`);
      const methodsData = await methodsRes.json();
      setPaymentMethods(methodsData.payment_methods || []);

      // Load payment plans
      const plansRes = await fetch(`/api/billing/payment-plans?homeowner_id=${homeownerId}`);
      const plansData = await plansRes.json();
      setPaymentPlans(plansData.payment_plans || []);
    } catch (error) {
      console.error("Error loading payment data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handlePayNow = async (invoiceId: string) => {
    // Create checkout session
    const response = await fetch("/api/billing/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_id: invoiceId,
        success_url: `${window.location.origin}/payments/success`,
        cancel_url: `${window.location.origin}/payments/cancel`,
      }),
    });

    const data = await response.json();
    if (data.url) {
      window.location.href = data.url;
    }
  };

  const handleToggleAutopay = async (invoiceId: string, enabled: boolean) => {
    if (!enabled) {
      // Disable auto-pay
      await fetch("/api/billing/autopay/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
    } else {
      // Enable auto-pay - need a payment method
      const defaultMethod = paymentMethods.find((m) => m.is_default);
      if (!defaultMethod) {
        alert("Please add a payment method first");
        return;
      }

      await fetch("/api/billing/autopay/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          payment_method_id: defaultMethod.id,
        }),
      });
    }

    loadData();
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  const totalOutstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + Number(i.balance_due), 0);

  const upcomingPayments = paymentPlans
    .flatMap((plan) => plan.schedule)
    .filter((item) => item.status === "pending")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paymentMethods.length}</div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setShowAddPaymentMethod(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Method
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Active Payment Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {paymentPlans.filter((p) => p.status === "active").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Outstanding Invoices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Outstanding Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {invoices.filter((i) => i.status !== "paid").length === 0 ? (
            <p className="text-sm text-gray-500">No outstanding invoices.</p>
          ) : (
            invoices
              .filter((i) => i.status !== "paid")
              .map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">Invoice {invoice.invoice_number}</span>
                      <Badge variant={invoice.status === "overdue" ? "destructive" : "secondary"}>
                        {invoice.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(Number(invoice.balance_due))}
                      </span>
                      {invoice.due_date && (
                        <span>
                          Due: {new Date(invoice.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handlePayNow(invoice.id)}
                      size="sm"
                    >
                      Pay Now
                    </Button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Auto-Pay</span>
                      <Switch
                        onCheckedChange={(checked) => handleToggleAutopay(invoice.id, checked)}
                      />
                    </div>
                  </div>
                </div>
              ))
          )}
        </CardContent>
      </Card>

      {/* Payment Plans */}
      {paymentPlans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Payment Plans
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentPlans.map((plan) => (
              <div key={plan.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium">
                      {formatCurrency(plan.total_amount)} over {plan.num_payments} payments
                    </div>
                    <div className="text-sm text-gray-500">
                      {plan.schedule.filter((s) => s.status === "paid").length} of {plan.num_payments} paid
                    </div>
                  </div>
                  <Badge variant={plan.status === "completed" ? "default" : "secondary"}>
                    {plan.status}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {plan.schedule.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          Payment {item.installment_number}: {formatCurrency(item.amount)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(item.date).toLocaleDateString()}
                        </span>
                      </div>
                      {item.status === "paid" ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          Paid
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // Handle payment for this installment
                            // This would create an invoice for the installment
                          }}
                        >
                          Pay Now
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stored Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Stored Payment Methods
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {paymentMethods.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-2">No payment methods saved</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddPaymentMethod(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Payment Method
              </Button>
            </div>
          ) : (
            paymentMethods.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="font-medium">
                      {method.type === "card"
                        ? `${method.brand?.toUpperCase()} •••• ${method.last4}`
                        : `${method.bank_name} •••• ${method.last4}`}
                    </div>
                    {method.type === "card" && method.exp_month && method.exp_year && (
                      <div className="text-xs text-gray-500">
                        Expires {method.exp_month}/{method.exp_year}
                      </div>
                    )}
                  </div>
                  {method.is_default && (
                    <Badge variant="outline" className="text-xs">Default</Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Upcoming Payments */}
      {upcomingPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Upcoming Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingPayments.map((payment, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <div className="font-medium">{formatCurrency(payment.amount)}</div>
                  <div className="text-xs text-gray-500">
                    Due {new Date(payment.date).toLocaleDateString()}
                  </div>
                </div>
                <Button size="sm" variant="outline">
                  Pay Now
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

























