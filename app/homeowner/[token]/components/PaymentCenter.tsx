"use client";

// Block 22880 — SmartSend Roofing Payments & Collections v1
// Payment Center Component for Homeowner Portal
// Shows invoices and payment links

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle2, Clock, AlertCircle, ExternalLink } from "lucide-react";

type Invoice = {
  id: string;
  type: "deposit" | "progress" | "final";
  amount: number;
  due_date: string | null;
  status: "draft" | "sent" | "viewed" | "paid" | "overdue";
  payment_link: string | null;
  created_at: string;
};

type Payment = {
  id: string;
  amount: number;
  method: string;
  created_at: string;
};

interface PaymentCenterProps {
  invoices: Invoice[];
  payments: Payment[];
}

export function PaymentCenter({ invoices, payments }: PaymentCenterProps) {
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
      case "sent":
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Sent
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
        return "Deposit Invoice";
      case "progress":
        return "Progress Payment";
      case "final":
        return "Final Invoice";
      default:
        return "Invoice";
    }
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  };

  // Calculate total paid
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.amount), 0);
  const balance = totalInvoiced - totalPaid;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Payment Center
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 pb-4 border-b">
          <div>
            <p className="text-xs text-gray-500">Total Invoiced</p>
            <p className="text-lg font-semibold">{formatCurrency(totalInvoiced)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Paid</p>
            <p className="text-lg font-semibold text-green-600">{formatCurrency(totalPaid)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Balance</p>
            <p className={`text-lg font-semibold ${balance > 0 ? "text-orange-600" : "text-gray-600"}`}>
              {formatCurrency(balance)}
            </p>
          </div>
        </div>

        {/* Invoices List */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Invoices</h3>
          {invoices.length === 0 ? (
            <p className="text-sm text-gray-500">No invoices yet.</p>
          ) : (
            invoices.map((invoice) => {
              const overdue = invoice.due_date && isOverdue(invoice.due_date) && invoice.status !== "paid";
              const displayStatus = overdue ? "overdue" : invoice.status;

              return (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{getInvoiceTypeLabel(invoice.type)}</span>
                      {getStatusBadge(displayStatus)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(Number(invoice.amount))}
                      </span>
                      {invoice.due_date && (
                        <span>
                          Due: {new Date(invoice.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {invoice.payment_link && invoice.status !== "paid" && (
                    <Button
                      onClick={() => window.open(invoice.payment_link!, "_blank")}
                      size="sm"
                      className="ml-4"
                    >
                      Pay Now
                      <ExternalLink className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                  {invoice.status === "paid" && (
                    <div className="ml-4 text-sm text-green-600 font-medium">
                      ✓ Paid
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-gray-700">Payment History</h3>
            <div className="space-y-2">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <span className="font-medium">{formatCurrency(Number(payment.amount))}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      via {payment.method.charAt(0).toUpperCase() + payment.method.slice(1)}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}







































