"use client";

// Block 88000 — SmartSend Roofing Payments Dashboard
// Shows outstanding balance, deposits, invoices, and payment management

import { useEffect, useState } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Plus,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

interface PaymentsDashboardProps {
  orgId: string;
}

type Invoice = {
  id: string;
  invoice_number: string;
  homeowner_name: string;
  homeowner_email: string;
  job_id: string | null;
  amount_due: number;
  amount_paid: number;
  due_date: string | null;
  status: "pending" | "partial" | "paid" | "overdue" | "cancelled";
  invoice_type: string;
  created_at: string;
};

type PaymentStats = {
  outstanding_balance: number;
  deposits_collected_month: number;
  invoices_sent: number;
  invoices_paid: number;
  overdue_invoices: number;
};

export function PaymentsDashboard({ orgId }: PaymentsDashboardProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<PaymentStats>({
    outstanding_balance: 0,
    deposits_collected_month: 0,
    invoices_sent: 0,
    invoices_paid: 0,
    overdue_invoices: 0,
  });
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    fetchData();
  }, [orgId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch invoices
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (invoicesError) throw invoicesError;
      setInvoices(invoicesData || []);

      // Calculate stats
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const outstandingBalance = invoicesData
        ?.filter((inv) => inv.status !== "paid" && inv.status !== "cancelled")
        .reduce((sum, inv) => sum + (inv.amount_due - inv.amount_paid), 0) || 0;

      const depositsThisMonth =
        invoicesData
          ?.filter(
            (inv) =>
              inv.invoice_type === "deposit" &&
              inv.status === "paid" &&
              new Date(inv.created_at) >= startOfMonth
          )
          .reduce((sum, inv) => sum + inv.amount_paid, 0) || 0;

      const invoicesSent = invoicesData?.length || 0;
      const invoicesPaid =
        invoicesData?.filter((inv) => inv.status === "paid").length || 0;
      const overdueInvoices =
        invoicesData?.filter((inv) => inv.status === "overdue").length || 0;

      setStats({
        outstanding_balance: outstandingBalance,
        deposits_collected_month: depositsThisMonth,
        invoices_sent: invoicesSent,
        invoices_paid: invoicesPaid,
        overdue_invoices: overdueInvoices,
      });
    } catch (error) {
      console.error("Error fetching payments data:", error);
    } finally {
      setLoading(false);
    }
  };

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
      case "partial":
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Partial
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-sm text-gray-500">Loading payments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Payments</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Track invoices, deposits, and homeowner payments
          </p>
        </div>
        <Link href="/payments/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Invoice
          </Button>
        </Link>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Outstanding Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(stats.outstanding_balance)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Deposits This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.deposits_collected_month)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Invoices Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.invoices_sent}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Invoices Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.invoices_paid}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats.overdue_invoices}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Recent Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No invoices yet.</p>
              <Link href="/payments/new">
                <Button variant="outline" className="mt-4">
                  Create Your First Invoice
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Homeowner</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Amount Due</TableHead>
                  <TableHead>Amount Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.invoice_number}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {invoice.homeowner_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {invoice.homeowner_email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {invoice.job_id ? (
                        <Link
                          href={`/jobs/${invoice.job_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          View Job
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(invoice.amount_due)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(invoice.amount_paid)}
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell>
                      {invoice.due_date
                        ? format(new Date(invoice.due_date), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/payments/invoices/${invoice.id}`}>
                        <Button variant="outline" size="sm">
                          View Invoice
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



























