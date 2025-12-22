"use client";

// Block 254700 — SmartSend Billing & Collections Engine v1
// Customer Payment Portal Client Component

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  CreditCard,
  CheckCircle2,
  Calendar,
  DollarSign,
  ExternalLink,
} from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  balance: number;
  due_date: string;
  issue_date: string;
  status: string;
  scope_summary?: string;
  notes?: string;
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
}

interface Payment {
  id: string;
  amount: number;
  date: string;
  method: string;
  status: string;
}

interface CustomerPaymentPortalClientProps {
  invoice: Invoice;
  payments: Payment[];
}

export function CustomerPaymentPortalClient({
  invoice,
  payments,
}: CustomerPaymentPortalClientProps) {
  const [processing, setProcessing] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const handlePayNow = async () => {
    setProcessing(true);
    // TODO: Integrate with payment processor (Stripe, Square, etc.)
    // For now, just show a message
    alert("Payment processing integration coming soon!");
    setProcessing(false);
  };

  const getStatusBadge = (status: string) => {
    if (status === "paid") {
      return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
    }
    if (status === "overdue") {
      return <Badge className="bg-red-100 text-red-800">Overdue</Badge>;
    }
    if (status === "partial") {
      return <Badge className="bg-yellow-100 text-yellow-800">Partial</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">Unpaid</Badge>;
  };

  const isOverdue = new Date(invoice.due_date) < new Date() && invoice.status !== "paid";

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Invoice Payment Portal</h1>
          <p className="text-gray-600">View and pay your invoice online</p>
        </div>

        {/* Invoice Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Invoice {invoice.invoice_number}
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Issued: {formatDate(invoice.issue_date)}
                </p>
              </div>
              {getStatusBadge(invoice.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Amount Due */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-600">Amount Due</div>
                  <div className="text-3xl font-bold text-blue-600">
                    {formatCurrency(invoice.balance)}
                  </div>
                  {invoice.balance < invoice.amount && (
                    <div className="text-sm text-gray-500 mt-1">
                      Total: {formatCurrency(invoice.amount)} • Paid:{" "}
                      {formatCurrency(invoice.amount - invoice.balance)}
                    </div>
                  )}
                </div>
                <DollarSign className="h-12 w-12 text-blue-600" />
              </div>
            </div>

            {/* Due Date */}
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-500" />
              <div>
                <div className="font-medium">Due Date</div>
                <div className={`text-sm ${isOverdue ? "text-red-600" : "text-gray-600"}`}>
                  {formatDate(invoice.due_date)}
                  {isOverdue && (
                    <span className="ml-2 font-semibold">• Overdue</span>
                  )}
                </div>
              </div>
            </div>

            {/* Scope Summary */}
            {invoice.scope_summary && (
              <div>
                <div className="font-medium mb-2">Scope of Work</div>
                <div className="text-gray-600">{invoice.scope_summary}</div>
              </div>
            )}

            {/* Line Items */}
            {invoice.line_items && invoice.line_items.length > 0 && (
              <div>
                <div className="font-medium mb-3">Line Items</div>
                <div className="space-y-2">
                  {invoice.line_items.map((item, index) => (
                    <div
                      key={index}
                      className="flex justify-between p-2 bg-gray-50 rounded"
                    >
                      <div>
                        <div className="font-medium">{item.description}</div>
                        <div className="text-sm text-gray-500">
                          {item.quantity} × {formatCurrency(item.unit_price)}
                        </div>
                      </div>
                      <div className="font-semibold">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {invoice.notes && (
              <div>
                <div className="font-medium mb-2">Notes</div>
                <div className="text-gray-600">{invoice.notes}</div>
              </div>
            )}

            {/* Payment Button */}
            {invoice.status !== "paid" && invoice.balance > 0 && (
              <div className="pt-4 border-t">
                <Button
                  onClick={handlePayNow}
                  disabled={processing}
                  className="w-full"
                  size="lg"
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  {processing ? "Processing..." : "Pay Now"}
                </Button>
                <div className="mt-2 text-center">
                  <Button variant="link" size="sm" asChild>
                    <a href="#" className="flex items-center gap-1">
                      View Financing Options
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment History */}
        {payments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="font-medium">
                          {formatCurrency(payment.amount)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatDate(payment.date)} • {payment.method}
                        </div>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">
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






















