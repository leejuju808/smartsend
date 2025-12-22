"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, DollarSign, AlertCircle, Calendar, TrendingUp, FileText } from "lucide-react";
import Link from "next/link";

interface ARSummary {
  total_ar: number;
  overdue_amount: number;
  due_this_week: number;
  paid_this_month: number;
  unpaid_count: number;
  overdue_count: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  total_amount: number;
  remaining_balance: number;
  status: string;
  due_date: string;
  invoice_date: string;
  days_overdue: number;
  jobs?: { id: string };
  customers?: { id: string; name: string; email: string };
}

export default function ARDashboardPage() {
  const [summary, setSummary] = useState<ARSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "overdue" | "due_soon">("all");

  useEffect(() => {
    fetchARData();
  }, [filter]);

  async function fetchARData() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("status", filter);
      }

      const response = await fetch(`/api/accounting/ar?${params.toString()}`);
      const data = await response.json();

      if (data.summary) {
        setSummary(data.summary);
      }
      if (data.invoices) {
        setInvoices(data.invoices);
      }
    } catch (error) {
      console.error("Error fetching AR data:", error);
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
          <div className="text-muted-foreground">Loading AR data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Accounts Receivable</h1>
          <p className="text-muted-foreground mt-1">
            Track invoices, payments, and collections
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/accounting/invoices/new">
            <Button>
              <FileText className="w-4 h-4 mr-2" />
              New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total AR</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.total_ar)}</div>
              <p className="text-xs text-muted-foreground">
                {summary.unpaid_count} unpaid invoices
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(summary.overdue_amount)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.overdue_count} overdue invoices
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.due_this_week)}</div>
              <p className="text-xs text-muted-foreground">Due in next 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paid This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.paid_this_month)}
              </div>
              <p className="text-xs text-muted-foreground">Collections this month</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            filter === "all"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All Invoices
        </button>
        <button
          onClick={() => setFilter("overdue")}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            filter === "overdue"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Overdue
        </button>
        <button
          onClick={() => setFilter("due_soon")}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            filter === "due_soon"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Due Soon
        </button>
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No invoices found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 text-sm font-medium">Invoice #</th>
                    <th className="text-left p-3 text-sm font-medium">Customer</th>
                    <th className="text-left p-3 text-sm font-medium">Type</th>
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
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {new Date(invoice.due_date).toLocaleDateString()}
                          {invoice.days_overdue > 0 && (
                            <span className="text-xs text-red-600">
                              ({invoice.days_overdue} days)
                            </span>
                          )}
                        </div>
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
                        <Link href={`/dashboard/accounting/invoices/${invoice.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        </Link>
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
