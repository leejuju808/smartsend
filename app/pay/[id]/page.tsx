"use client";

// Block 39200 — SmartSend Roofing Invoice Engine
// Customer payment page - public, no auth required

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Download, Calendar } from "lucide-react";
import { format } from "date-fns";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type InvoiceData = {
  invoice: {
    id: string;
    invoice_number: string;
    amount: number;
    balance_due: number;
    due_date: string | null;
    status: string;
    type: string;
    created_at: string;
    roofing_jobs: {
      title: string;
    } | null;
    leads: {
      first_name: string;
      last_name: string;
      email: string;
    } | null;
  };
  payments: Array<{
    id: string;
    amount: number;
    status: string;
    created_at: string;
  }>;
  events: Array<{
    event: string;
    created_at: string;
  }>;
};

function PaymentForm({ invoiceData }: { invoiceData: InvoiceData }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || "Please check your payment details");
      setLoading(false);
      return;
    }

    try {
      // Create payment intent if needed
      const response = await fetch(`/api/invoices/${invoiceData.invoice.id}/payment-intent`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to create payment intent");
      }

      const { client_secret } = await response.json();

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret: client_secret,
        confirmParams: {
          return_url: `${window.location.origin}/pay/${invoiceData.invoice.id}/success`,
        },
        redirect: "if_required",
      });

      if (confirmError) {
        setError(confirmError.message || "Payment failed");
      } else {
        setSuccess(true);
        // Refresh page after a moment to show updated status
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">Payment Successful!</h3>
        <p className="text-gray-600">Your payment has been processed.</p>
      </div>
    );
  }

  if (invoiceData.invoice.status === "paid") {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">Invoice Paid</h3>
        <p className="text-gray-600">This invoice has already been paid.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      <Button
        type="submit"
        disabled={!stripe || loading}
        className="w-full"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          `Pay $${Number(invoiceData.invoice.balance_due).toFixed(2)}`
        )}
      </Button>
      <p className="text-xs text-gray-500 text-center">
        Secure payment powered by Stripe
      </p>
    </form>
  );
}

export default function InvoicePaymentPage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const response = await fetch(`/api/invoices/${invoiceId}/pay`);
        if (!response.ok) {
          throw new Error("Invoice not found");
        }
        const data = await response.json();
        setInvoiceData(data);

        // Track invoice view
        if (data.invoice.status !== "paid") {
          await fetch(`/api/invoices/${invoiceId}/view`, {
            method: "POST",
          });
        }

        // Create payment intent for Stripe Elements
        if (data.invoice.balance_due > 0 && data.invoice.status !== "paid") {
          const intentResponse = await fetch(
            `/api/invoices/${invoiceId}/payment-intent`,
            { method: "POST" }
          );
          if (intentResponse.ok) {
            const { client_secret } = await intentResponse.json();
            setClientSecret(client_secret);
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load invoice");
      } finally {
        setLoading(false);
      }
    };

    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !invoiceData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invoice Not Found</h2>
            <p className="text-gray-600">{error || "This invoice could not be found."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invoice = invoiceData.invoice;
  const totalPaid = invoiceData.payments.reduce(
    (sum, p) => sum + (p.status === "succeeded" ? Number(p.amount) : 0),
    0
  );

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Invoice Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl mb-2">Invoice Payment</CardTitle>
                <p className="text-sm text-gray-600">
                  Invoice #{invoice.invoice_number}
                </p>
              </div>
              <Badge
                variant={
                  invoice.status === "paid"
                    ? "default"
                    : invoice.status === "overdue"
                    ? "destructive"
                    : "secondary"
                }
              >
                {invoice.status.replace("_", " ").toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {invoice.roofing_jobs && (
              <div>
                <p className="text-sm text-gray-600">Job</p>
                <p className="font-medium">{invoice.roofing_jobs.title}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Invoice Date</p>
                <p className="font-medium">
                  {format(new Date(invoice.created_at), "MMM d, yyyy")}
                </p>
              </div>
              {invoice.due_date && (
                <div>
                  <p className="text-sm text-gray-600">Due Date</p>
                  <p className="font-medium flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(invoice.due_date), "MMM d, yyyy")}
                  </p>
                </div>
              )}
            </div>
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Invoice Amount</span>
                <span className="font-medium">${Number(invoice.amount).toFixed(2)}</span>
              </div>
              {totalPaid > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount Paid</span>
                  <span className="font-medium text-green-600">
                    -${totalPaid.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>Balance Due</span>
                <span>${Number(invoice.balance_due).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/invoices/${invoice.id}/pdf`, "_blank")}
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Payment Form */}
        {invoice.balance_due > 0 && invoice.status !== "paid" && clientSecret && (
          <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "stripe",
                  },
                }}
              >
                <PaymentForm invoiceData={invoiceData} />
              </Elements>
            </CardContent>
          </Card>
        )}

        {/* Payment History */}
        {invoiceData.payments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {invoiceData.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded"
                  >
                    <div>
                      <p className="font-medium">
                        ${Number(payment.amount).toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(payment.created_at), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <Badge
                      variant={
                        payment.status === "succeeded" ? "default" : "secondary"
                      }
                    >
                      {payment.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
































