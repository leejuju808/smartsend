"use client";

// Block 240000 — SmartSend Roofing Billing & Payments Hub
// Invoice Detail Client Component

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Send,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";

interface InvoiceDetailClientProps {
  invoice: any;
  transactions: any[];
  reminders: any[];
  qbSync: any;
  autopayRules: any[];
}

export function InvoiceDetailClient({
  invoice,
  transactions,
  reminders,
  qbSync,
  autopayRules,
}: InvoiceDetailClientProps) {
  const [loading, setLoading] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  const handleSendInvoice = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/billing/invoice/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoice.id }),
      });

      if (response.ok) {
        alert("Invoice sent successfully!");
      } else {
        alert("Failed to send invoice");
      }
    } catch (error) {
      console.error("Error sending invoice:", error);
      alert("Error sending invoice");
    } finally {
      setLoading(false);
    }
  };

  const handleRetryPayment = async (transactionId: string) => {
    // This would retry a failed payment
    alert("Retry payment functionality coming soon");
  };

  const handleSyncQuickBooks = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/billing/qbo/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoice.id }),
      });

      if (response.ok) {
        alert("Synced to QuickBooks successfully!");
        window.location.reload();
      } else {
        alert("Failed to sync to QuickBooks");
      }
    } catch (error) {
      console.error("Error syncing to QuickBooks:", error);
      alert("Error syncing to QuickBooks");
    } finally {
      setLoading(false);
    }
  };

  const totalPaid = transactions
    .filter((t) => t.status === "succeeded")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const balanceDue = Number(invoice.amount) - totalPaid;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Invoice {invoice.invoice_number}</h1>
            <Badge
              variant={
                invoice.status === "paid"
                  ? "default"
                  : invoice.status === "overdue"
                  ? "destructive"
                  : "secondary"
              }
            >
              {invoice.status}
            </Badge>
          </div>
          <p className="text-gray-600 mt-1">
            Created {new Date(invoice.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSendInvoice} disabled={loading}>
            <Send className="w-4 h-4 mr-2" />
            Send Invoice
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Homeowner</p>
                  <p className="font-medium">
                    {invoice.jobs?.leads?.first_name} {invoice.jobs?.leads?.last_name}
                  </p>
                  <p className="text-sm text-gray-600">{invoice.jobs?.leads?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Job</p>
                  <p className="font-medium">
                    {invoice.job_id ? (
                      <Link href={`/jobs/${invoice.job_id}`} className="text-blue-600 hover:underline">
                        View Job
                      </Link>
                    ) : (
                      "N/A"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p className="font-medium">
                    {invoice.due_date
                      ? new Date(invoice.due_date).toLocaleDateString()
                      : "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Invoice Type</p>
                  <p className="font-medium capitalize">{invoice.type}</p>
                </div>
              </div>

              {/* Line Items */}
              {invoice.invoice_line_items && invoice.invoice_line_items.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Line Items</h3>
                  <div className="space-y-2">
                    {invoice.invoice_line_items.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded"
                      >
                        <div>
                          <p className="font-medium">{item.description}</p>
                          <p className="text-sm text-gray-500">
                            {item.quantity} × {formatCurrency(item.unit_price)}
                          </p>
                        </div>
                        <p className="font-medium">{formatCurrency(item.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice Amount</span>
                  <span className="font-medium">{formatCurrency(Number(invoice.amount))}</span>
                </div>
                {totalPaid > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount Paid</span>
                    <span className="font-medium text-green-600">
                      -{formatCurrency(totalPaid)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Balance Due</span>
                  <span>{formatCurrency(balanceDue)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="text-sm text-gray-500">No payments yet.</p>
              ) : (
                <div className="space-y-3">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatCurrency(Number(transaction.amount))}</span>
                          <Badge
                            variant={
                              transaction.status === "succeeded"
                                ? "default"
                                : transaction.status === "failed"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {transaction.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {transaction.payment_methods && (
                            <span>
                              {transaction.payment_methods.type === "card"
                                ? `${transaction.payment_methods.brand?.toUpperCase()} •••• ${transaction.payment_methods.last4}`
                                : `${transaction.payment_methods.bank_name} •••• ${transaction.payment_methods.last4}`}
                            </span>
                          )}
                          <span className="ml-2">
                            {new Date(transaction.created_at).toLocaleString()}
                          </span>
                        </div>
                        {transaction.failure_reason && (
                          <p className="text-sm text-red-600 mt-1">
                            {transaction.failure_reason}
                          </p>
                        )}
                      </div>
                      {transaction.status === "failed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetryPayment(transaction.id)}
                        >
                          <RefreshCw className="w-4 h-4 mr-1" />
                          Retry
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Reminders */}
          {reminders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payment Reminders Sent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {reminders.map((reminder) => (
                    <div
                      key={reminder.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <div>
                        <p className="text-sm font-medium capitalize">{reminder.reminder_type}</p>
                        <p className="text-xs text-gray-500">
                          Sent via {reminder.sent_via} on{" "}
                          {new Date(reminder.sent_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" variant="outline">
                <CreditCard className="w-4 h-4 mr-2" />
                Charge Payment Method
              </Button>
              <Button className="w-full" variant="outline" onClick={handleSyncQuickBooks}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync to QuickBooks
              </Button>
              <Button className="w-full" variant="outline">
                <Trash2 className="w-4 h-4 mr-2" />
                Cancel Invoice
              </Button>
            </CardContent>
          </Card>

          {/* Auto-Pay Status */}
          {autopayRules.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Auto-Pay</CardTitle>
              </CardHeader>
              <CardContent>
                {autopayRules.map((rule) => (
                  <div key={rule.id} className="p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium">Active</span>
                    </div>
                    {rule.payment_methods && (
                      <p className="text-xs text-gray-600">
                        Using {rule.payment_methods.type === "card" ? "Card" : "ACH"}{" "}
                        •••• {rule.payment_methods.last4}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* QuickBooks Sync Status */}
          <Card>
            <CardHeader>
              <CardTitle>QuickBooks Sync</CardTitle>
            </CardHeader>
            <CardContent>
              {qbSync ? (
                <div>
                  <Badge
                    variant={
                      qbSync.sync_status === "synced"
                        ? "default"
                        : qbSync.sync_status === "failed"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {qbSync.sync_status}
                  </Badge>
                  {qbSync.qbo_invoice_id && (
                    <p className="text-xs text-gray-500 mt-2">
                      QBO Invoice: {qbSync.qbo_invoice_id}
                    </p>
                  )}
                  {qbSync.synced_at && (
                    <p className="text-xs text-gray-500">
                      Synced: {new Date(qbSync.synced_at).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Not synced</p>
                  <Button size="sm" variant="outline" onClick={handleSyncQuickBooks}>
                    Sync Now
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

























