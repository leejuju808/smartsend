"use client";

// Block 254700 — SmartSend Billing & Collections Engine v1
// Payment Tracking Dashboard Component

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  AlertCircle,
  FileText,
  CreditCard,
  TrendingUp,
  Clock,
  CheckCircle2,
  ArrowRight,
  Calendar,
} from "lucide-react";
import Link from "next/link";

interface DashboardData {
  summary: {
    outstanding_count: number;
    outstanding_amount: number;
    overdue_count: number;
    overdue_amount: number;
    due_this_week_count: number;
    due_this_week_amount: number;
  };
  unpaid_invoices: Array<{
    id: string;
    invoice_number: string;
    job_id: string;
    customer_id: string;
    amount: number;
    balance: number;
    due_date: string;
    status: string;
    days_overdue: number;
  }>;
  recent_payments: Array<{
    id: string;
    amount: number;
    date: string;
    method: string;
    invoices: {
      invoice_number: string;
    };
  }>;
}

export function PaymentTrackingDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const res = await fetch("/api/billing/dashboard");
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusBadge = (status: string, daysOverdue: number) => {
    if (status === "paid") {
      return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
    }
    if (status === "overdue" || daysOverdue > 0) {
      return <Badge className="bg-red-100 text-red-800">Overdue</Badge>;
    }
    if (status === "partial") {
      return <Badge className="bg-yellow-100 text-yellow-800">Partial</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">Unpaid</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-red-500">Failed to load dashboard data</div>
      </div>
    );
  }

  const { summary, unpaid_invoices, recent_payments } = data;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payment Tracking Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Full visibility on outstanding money and cashflow
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/billing/invoices/new">Create Invoice</Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Outstanding
            </CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(summary.outstanding_amount)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {summary.outstanding_count} invoice
              {summary.outstanding_count !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Overdue
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(summary.overdue_amount)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {summary.overdue_count} invoice
              {summary.overdue_count !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Due This Week
            </CardTitle>
            <Calendar className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(summary.due_this_week_amount)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {summary.due_this_week_count} invoice
              {summary.due_this_week_count !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Unpaid Invoices List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Unpaid Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unpaid_invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No unpaid invoices
            </div>
          ) : (
            <div className="space-y-4">
              {unpaid_invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="font-semibold">
                          {invoice.invoice_number}
                        </div>
                        <div className="text-sm text-gray-500">
                          Due: {formatDate(invoice.due_date)}
                          {invoice.days_overdue > 0 && (
                            <span className="text-red-600 ml-2">
                              • {invoice.days_overdue} day
                              {invoice.days_overdue !== 1 ? "s" : ""} late
                            </span>
                          )}
                        </div>
                      </div>
                      {getStatusBadge(invoice.status, invoice.days_overdue)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-lg">
                      {formatCurrency(invoice.balance)}
                    </div>
                    <div className="text-sm text-gray-500">
                      of {formatCurrency(invoice.amount)}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="ml-4" asChild>
                    <Link href={`/billing/invoices/${invoice.id}`}>
                      View <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Recent Payments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent_payments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No recent payments
            </div>
          ) : (
            <div className="space-y-3">
              {recent_payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <div className="font-medium">
                        {payment.invoices?.invoice_number || "N/A"}
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatDate(payment.date)} • {payment.method}
                      </div>
                    </div>
                  </div>
                  <div className="font-semibold text-green-600">
                    {formatCurrency(payment.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}






















