"use client";

// Block 88000 — Homeowner Payment Portal
// Clean, branded portal for homeowners to view invoice and pay

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  CreditCard,
  FileText,
  DollarSign,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";

interface HomeownerPaymentPortalProps {
  invoice: any;
  paymentLink: any;
  token: string;
}

export function HomeownerPaymentPortal({
  invoice,
  paymentLink,
  token,
}: HomeownerPaymentPortalProps) {
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(invoice.status === "paid");

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const handlePayNow = () => {
    if (paymentLink.payment_url) {
      window.location.href = paymentLink.payment_url;
    }
  };

  const amountRemaining = invoice.amount_due - invoice.amount_paid;

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Payment Portal
          </h1>
          <p className="text-gray-600">
            Invoice {invoice.invoice_number}
          </p>
        </div>

        {/* Invoice Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Invoice Details
              </CardTitle>
              {paid ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Paid
                </Badge>
              ) : (
                <Badge variant="outline">Pending</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Invoice Number</p>
                <p className="font-semibold">{invoice.invoice_number}</p>
              </div>
              {invoice.due_date && (
                <div>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Due Date
                  </p>
                  <p className="font-semibold">
                    {format(new Date(invoice.due_date), "MMM d, yyyy")}
                  </p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm text-gray-500">Bill To</p>
              <p className="font-semibold">{invoice.homeowner_name}</p>
              <p className="text-sm text-gray-600">{invoice.homeowner_email}</p>
            </div>

            {invoice.notes && (
              <div>
                <p className="text-sm text-gray-500">Notes</p>
                <p className="text-sm">{invoice.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Payment Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Amount Due</span>
              <span className="font-semibold">
                {formatCurrency(invoice.amount_due)}
              </span>
            </div>
            {invoice.amount_paid > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Amount Paid</span>
                <span className="font-semibold">
                  {formatCurrency(invoice.amount_paid)}
                </span>
              </div>
            )}
            <div className="border-t pt-3 flex justify-between">
              <span className="text-lg font-semibold">Remaining Balance</span>
              <span className="text-2xl font-bold text-orange-600">
                {formatCurrency(amountRemaining)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Payment Button */}
        {!paid && amountRemaining > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <p className="text-gray-600">
                  Pay securely with your credit card or bank account
                </p>
                <Button
                  onClick={handlePayNow}
                  disabled={loading}
                  size="lg"
                  className="w-full"
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  {loading ? "Processing..." : "Pay Now"}
                </Button>
                <p className="text-xs text-gray-500">
                  Powered by Stripe • Secure payment processing
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {paid && (
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-green-900 mb-2">
                Payment Received
              </h3>
              <p className="text-green-700">
                Thank you for your payment. Your invoice has been marked as paid.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}



























