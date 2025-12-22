"use client";

// Block 240000 — SmartSend Roofing Billing & Payments Hub
// Billing Dashboard Client Component

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
} from "lucide-react";
import Link from "next/link";

interface BillingDashboardClientProps {
  workspaceId: string;
  initialMetrics?: any;
}

export function BillingDashboardClient({
  workspaceId,
  initialMetrics,
}: BillingDashboardClientProps) {
  const [metrics, setMetrics] = useState(initialMetrics || {});
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [workspaceId]);

  const loadDashboardData = async () => {
    try {
      // Load metrics
      const metricsRes = await fetch(`/api/billing/dashboard/metrics?workspace_id=${workspaceId}`);
      const metricsData = await metricsRes.json();
      setMetrics(metricsData.metrics || {});

      // Load recent invoices
      const invoicesRes = await fetch(`/api/billing/invoices?workspace_id=${workspaceId}&limit=10`);
      const invoicesData = await invoicesRes.json();
      setInvoices(invoicesData.invoices || []);
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

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing Dashboard</h1>
          <p className="text-gray-600 mt-1">Track payments, invoices, and cashflow</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/billing/invoices/new">Create Invoice</Link>
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Collected This Month
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(metrics.amount_collected_this_month || 0)}
            </div>
            <p className="text-xs text-gray-500 mt-1">All successful payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Amount Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(metrics.amount_overdue || 0)}
            </div>
            <p className="text-xs text-gray-500 mt-1">Past due invoices</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Unpaid Invoices</CardTitle>
            <FileText className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.unpaid_invoices_count || 0}</div>
            <p className="text-xs text-gray-500 mt-1">Pending payment</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Auto-Pay Enabled</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.autopay_enabled_count || 0}</div>
            <p className="text-xs text-gray-500 mt-1">Active auto-pay rules</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Cards on File</CardTitle>
            <CreditCard className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.card_on_file_count || 0}</div>
            <p className="text-xs text-gray-500 mt-1">Saved payment methods</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Avg Days to Pay</CardTitle>
            <Clock className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.average_days_to_pay
                ? Math.round(metrics.average_days_to_pay)
                : 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">Payment speed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Failed Payments</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {metrics.failed_payments_count || 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Collection Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.collection_rate ? `${metrics.collection_rate}%` : "N/A"}
            </div>
            <p className="text-xs text-gray-500 mt-1">On-time payments</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Invoices */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Invoices</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/billing/invoices">View All</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-gray-500">No invoices yet.</p>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Invoice {invoice.invoice_number}</span>
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
                    <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                      <span className="font-semibold">{formatCurrency(Number(invoice.amount))}</span>
                      {invoice.due_date && (
                        <span>Due: {new Date(invoice.due_date).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/billing/invoices/${invoice.id}`}>
                      View <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

























