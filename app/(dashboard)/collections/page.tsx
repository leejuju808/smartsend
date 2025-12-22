"use client";

// Block 26200 — SmartSend Roofing AR/AP Collections Engine v1
// Global Collections View Page
// Table of all unpaid invoices with filters and quick actions

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Mail,
  Phone,
  Search,
  Filter,
} from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";
import Link from "next/link";

type InvoiceBalance = {
  invoice_id: string;
  job_id: string;
  workspace_id: string;
  payer_type: "homeowner" | "insurance" | "other";
  payer_name: string | null;
  payer_email: string | null;
  payer_phone: string | null;
  invoice_number: string | null;
  invoice_amount: number;
  amount_paid: number;
  balance_due: number;
  due_date: string | null;
  status: "draft" | "sent" | "partial" | "paid" | "overdue";
  insurance_company: string | null;
  claim_number: string | null;
  check_stage: string | null;
};

export default function CollectionsPage() {
  const [invoices, setInvoices] = useState<InvoiceBalance[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<InvoiceBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [payerTypeFilter, setPayerTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const supabase = createClient();

  useEffect(() => {
    fetchInvoices();
  }, []);

  useEffect(() => {
    filterInvoices();
  }, [invoices, statusFilter, payerTypeFilter, searchQuery]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("roofing_invoice_balances")
        .select("*")
        .neq("balance_due", 0)
        .order("due_date", { ascending: true, nullsLast: true });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterInvoices = () => {
    let filtered = [...invoices];

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((inv) => inv.status === statusFilter);
    }

    // Payer type filter
    if (payerTypeFilter !== "all") {
      filtered = filtered.filter((inv) => inv.payer_type === payerTypeFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.payer_name?.toLowerCase().includes(query) ||
          inv.payer_email?.toLowerCase().includes(query) ||
          inv.invoice_number?.toLowerCase().includes(query) ||
          inv.claim_number?.toLowerCase().includes(query)
      );
    }

    setFilteredInvoices(filtered);
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
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            Partial
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

  const handleSendReminder = async (invoice: InvoiceBalance) => {
    if (!invoice.payer_email) {
      alert("No email address available for this payer");
      return;
    }

    try {
      // Call API to send reminder email
      const response = await fetch("/api/collections/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          payer_email: invoice.payer_email,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send reminder");
      }

      alert("Reminder email sent!");
    } catch (error) {
      console.error("Error sending reminder:", error);
      alert("Failed to send reminder email");
    }
  };

  const handleMarkPaid = async (invoice: InvoiceBalance) => {
    const amount = prompt(
      `Enter payment amount (balance: ${formatCurrency(Number(invoice.balance_due))}):`
    );

    if (!amount || isNaN(parseFloat(amount))) {
      return;
    }

    try {
      const response = await fetch("/api/collections/add-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          amount: parseFloat(amount),
          method: "manual",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add payment");
      }

      await fetchInvoices();
      alert("Payment recorded!");
    } catch (error) {
      console.error("Error adding payment:", error);
      alert("Failed to record payment");
    }
  };

  const handleCreateCallTask = async (invoice: InvoiceBalance) => {
    try {
      const response = await fetch("/api/collections/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.invoice_id,
          job_id: invoice.job_id,
          workspace_id: invoice.workspace_id,
          title: `Call ${invoice.payer_name || invoice.payer_email} about invoice balance`,
          priority: invoice.status === "overdue" ? "high" : "medium",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create task");
      }

      alert("Call task created!");
    } catch (error) {
      console.error("Error creating task:", error);
      alert("Failed to create call task");
    }
  };

  const totalBalance = filteredInvoices.reduce(
    (sum, inv) => sum + Number(inv.balance_due),
    0
  );
  const overdueCount = filteredInvoices.filter((inv) => inv.status === "overdue").length;
  const overdueAmount = filteredInvoices
    .filter((inv) => inv.status === "overdue")
    .reduce((sum, inv) => sum + Number(inv.balance_due), 0);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading collections...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Collections</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track unpaid invoices, overdue balances, and collections activity
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Balance Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Overdue Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
            <div className="text-xs text-gray-500 mt-1">
              {formatCurrency(overdueAmount)} overdue
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredInvoices.length}</div>
            <div className="text-xs text-gray-500 mt-1">
              {invoices.length} total
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Payer Type</label>
              <Select value={payerTypeFilter} onValueChange={setPayerTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="homeowner">Homeowner</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name, email, invoice..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Unpaid Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No invoices match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-3">Invoice</th>
                    <th className="pb-3">Payer</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Due Date</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Balance</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((inv) => (
                    <tr
                      key={inv.invoice_id}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="py-3">
                        <div className="font-medium">
                          {inv.invoice_number || inv.invoice_id.slice(0, 8)}
                        </div>
                        {inv.job_id && (
                          <Link
                            href={`/jobs/${inv.job_id}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            View Job
                          </Link>
                        )}
                      </td>
                      <td className="py-3">
                        <div>{inv.payer_name || "—"}</div>
                        {inv.payer_email && (
                          <div className="text-xs text-gray-500">{inv.payer_email}</div>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline">{inv.payer_type}</Badge>
                        {inv.payer_type === "insurance" && inv.insurance_company && (
                          <div className="text-xs text-gray-500 mt-1">
                            {inv.insurance_company}
                          </div>
                        )}
                      </td>
                      <td className="py-3">
                        {inv.due_date
                          ? new Date(inv.due_date).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-3">{getStatusBadge(inv.status)}</td>
                      <td className="py-3 text-right font-medium">
                        {formatCurrency(Number(inv.balance_due))}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-2">
                          {inv.payer_email && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendReminder(inv)}
                              title="Send reminder email"
                            >
                              <Mail className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCreateCallTask(inv)}
                            title="Create call task"
                          >
                            <Phone className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleMarkPaid(inv)}
                            title="Mark as paid"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
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



































