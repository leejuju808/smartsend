"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Send, DollarSign, Calendar, User, FileText } from "lucide-react";
import Link from "next/link";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  remaining_balance: number;
  status: string;
  due_date: string;
  invoice_date: string;
  description: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>;
  notes: string;
  customers?: { id: string; name: string; email: string; phone: string; address: string };
  jobs?: { id: string; stage: string; contract_value: number };
  payments?: Array<{
    id: string;
    amount: number;
    payment_method: string;
    payment_reference: string;
    received_at: string;
    note: string;
  }>;
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  async function fetchInvoice() {
    try {
      setLoading(true);
      const response = await fetch(`/api/accounting/invoices/${invoiceId}`);
      const data = await response.json();
      if (data.invoice) {
        setInvoice(data.invoice);
      }
    } catch (error) {
      console.error("Error fetching invoice:", error);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-800";
      case "partially_paid":
        return "bg-yellow-100 text-yellow-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading invoice...</div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Invoice not found</p>
          <Link href="/dashboard/accounting/invoices">
            <Button className="mt-4">Back to Invoices</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/accounting/invoices">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{invoice.invoice_number}</h1>
            <p className="text-muted-foreground mt-1">Invoice Details</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/api/accounting/invoices/${invoiceId}/pdf`} target="_blank">
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          </Link>
          <Button>
            <Send className="w-4 h-4 mr-2" />
            Send Invoice
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Invoice Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Invoice Number</label>
                  <p className="text-lg font-semibold">{invoice.invoice_number}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="mt-1">
                    <Badge className={getStatusColor(invoice.status)}>
                      {invoice.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Invoice Date</label>
                  <p>{new Date(invoice.invoice_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Due Date</label>
                  <p>{new Date(invoice.due_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Type</label>
                  <p>{invoice.invoice_type.replace("_", " ")}</p>
                </div>
                {invoice.jobs && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Job</label>
                    <Link href={`/dashboard/pipeline?job=${invoice.jobs.id}`}>
                      <p className="text-primary hover:underline">Job #{invoice.jobs.id.slice(0, 8)}</p>
                    </Link>
                  </div>
                )}
              </div>

              {invoice.description && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <p className="mt-1">{invoice.description}</p>
                </div>
              )}

              {invoice.notes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Notes</label>
                  <p className="mt-1">{invoice.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.line_items && invoice.line_items.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 text-sm font-medium">Description</th>
                      <th className="text-right p-2 text-sm font-medium">Quantity</th>
                      <th className="text-right p-2 text-sm font-medium">Unit Price</th>
                      <th className="text-right p-2 text-sm font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.line_items.map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2">{item.description}</td>
                        <td className="p-2 text-right">{item.quantity}</td>
                        <td className="p-2 text-right">{formatCurrency(item.unit_price)}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted-foreground">No line items</p>
              )}

              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(invoice.amount)}</span>
                </div>
                {invoice.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax:</span>
                    <span className="font-medium">{formatCurrency(invoice.tax_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Total:</span>
                  <span>{formatCurrency(invoice.total_amount)}</span>
                </div>
                {invoice.paid_amount > 0 && (
                  <>
                    <div className="flex justify-between text-green-600">
                      <span>Paid:</span>
                      <span>{formatCurrency(invoice.paid_amount)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold">
                      <span>Balance Due:</span>
                      <span>{formatCurrency(invoice.remaining_balance)}</span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payments */}
          {invoice.payments && invoice.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {invoice.payments.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{formatCurrency(payment.amount)}</p>
                          <p className="text-sm text-muted-foreground">
                            {payment.payment_method.replace("_", " ")}
                            {payment.payment_reference && ` • ${payment.payment_reference}`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(payment.received_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {payment.note && (
                        <p className="text-sm text-muted-foreground mt-2">{payment.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.customers ? (
                <div className="space-y-2">
                  <p className="font-medium">{invoice.customers.name}</p>
                  {invoice.customers.email && (
                    <p className="text-sm text-muted-foreground">{invoice.customers.email}</p>
                  )}
                  {invoice.customers.phone && (
                    <p className="text-sm text-muted-foreground">{invoice.customers.phone}</p>
                  )}
                  {invoice.customers.address && (
                    <p className="text-sm text-muted-foreground">{invoice.customers.address}</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">No customer assigned</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Total Amount</label>
                <p className="text-2xl font-bold">{formatCurrency(invoice.total_amount)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Paid</label>
                <p className="text-xl font-semibold text-green-600">
                  {formatCurrency(invoice.paid_amount)}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Balance Due</label>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(invoice.remaining_balance)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/dashboard/accounting/invoices/${invoiceId}/payment`} className="block">
                <Button className="w-full">
                  <DollarSign className="w-4 h-4 mr-2" />
                  Record Payment
                </Button>
              </Link>
              <Button variant="outline" className="w-full">
                <Send className="w-4 h-4 mr-2" />
                Send Reminder
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
