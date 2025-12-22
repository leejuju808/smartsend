"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function PaymentForm({ invoiceId }: { invoiceId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`);
      if (!response.ok) throw new Error("Failed to load invoice");

      const data = await response.json();
      setInvoice(data.invoice);

      // Create payment intent
      const intentResponse = await fetch("/api/stripe/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });

      if (!intentResponse.ok) throw new Error("Failed to create payment intent");

      const intentData = await intentResponse.json();
      setClientSecret(intentData.client_secret);
    } catch (err: any) {
      setError(err.message || "Failed to load invoice");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: submitError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/pay/success?invoice_id=${invoiceId}`,
        },
      });

      if (submitError) {
        setError(submitError.message || "Payment failed");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "Payment failed");
      setLoading(false);
    }
  };

  if (!invoice || !clientSecret) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading payment form...</p>
        </div>
      </div>
    );
  }

  const milestone = invoice.payment_milestones;
  const schedule = milestone?.payment_schedules;
  const job = schedule?.roofing_jobs;
  const contract = schedule?.contract_documents;
  const lead = contract?.leads;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Payment</h1>
            <p className="text-gray-600">Invoice {invoice.invoice_number}</p>
          </div>

          {/* Invoice Details */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Job:</span>
                <span className="font-semibold">{job?.title || "Roofing Job"}</span>
              </div>
              {job?.address && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Address:</span>
                  <span className="font-semibold">{job.address}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Milestone:</span>
                <span className="font-semibold">{milestone?.label || "Payment"}</span>
              </div>
              {invoice.due_date && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Due Date:</span>
                  <span className="font-semibold">
                    {new Date(invoice.due_date).toLocaleDateString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-3 border-t">
                <span className="text-lg font-semibold">Amount Due:</span>
                <span className="text-2xl font-bold text-blue-600">
                  ${invoice.amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <PaymentElement />
            
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={!stripe || loading}
              className="w-full py-6 text-lg"
            >
              {loading ? "Processing..." : `Pay $${invoice.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>Secure payment powered by Stripe</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvoicePaymentPage() {
  const params = useParams();
  const invoiceId = params.id as string;

  if (!invoiceId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Invalid invoice ID</p>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600">Payment system not configured</p>
          <p className="text-sm text-gray-600 mt-2">Please contact support</p>
        </div>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <PaymentForm invoiceId={invoiceId} />
    </Elements>
  );
}

























