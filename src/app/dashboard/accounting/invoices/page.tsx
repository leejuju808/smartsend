"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Download, Send } from "lucide-react";
import Link from "next/link";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  total_amount: number;
  remaining_balance: number;
  status: string;
  due_date: string;
  invoice_date: string;
  customers?: { id: string; name: string; email: string };
  jobs?: { id: string; stage: string };
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    try {
      setLoading(true);
      const response = await fetch("/api/accounting/invoices");
      const data = await response.json();
      if (data.invoices) {
        setInvoices(data.invoices);
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
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
          <div className="text-muted-foreground">Loading invoices...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-muted-foreground mt-1">
            Manage all your invoices
          </p>
        </div>
        <Link href="/dashboard/accounting/invoices/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Invoice
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Invoices</CardTitle>
          <CardDescription>
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No invoices yet</p>
              <Link href="/dashboard/accounting/invoices/new">
                <Button className="mt-4">Create Your First Invoice</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 text-sm font-medium">Invoice #</th>
                    <th className="text-left p-3 text-sm font-medium">Customer</th>
                    <th className="text-left p-3 text-sm font-medium">Type</th>
                    <th className="text-left p-3 text-sm font-medium">Date</th>
                    <th className="text-left p-3 text-sm font-medium">Due Date</th>
                    <th className="text-right p-3 text-sm font-medium">Amount</th>
                    <th className="text-right p-3 text-sm font-medium">Balance</th>
                    <th className="text-left p-3 text-sm font-medium">Status</th>
                    <th className="text-right p-3 text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b hover:bg-muted/50">
                      <td className="p-3">
                        <Link
                          href={`/dashboard/accounting/invoices/${invoice.id}`}
                          className="font-medium hover:underline"
                        >
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td className="p-3">
                        {invoice.customers?.name || "N/A"}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">
                          {invoice.invoice_type.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {new Date(invoice.invoice_date).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-sm">
                        {new Date(invoice.due_date).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatCurrency(invoice.total_amount)}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatCurrency(invoice.remaining_balance)}
                      </td>
                      <td className="p-3">
                        <Badge className={getStatusColor(invoice.status)}>
                          {invoice.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/api/accounting/invoices/${invoice.id}/pdf`} target="_blank">
                            <Button variant="ghost" size="sm">
                              <Download className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Link href={`/dashboard/accounting/invoices/${invoice.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
