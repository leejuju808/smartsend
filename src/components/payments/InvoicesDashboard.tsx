"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface Invoice {
  id: string;
  invoice_number: string;
  milestone_id: string;
  amount: number;
  due_date: string | null;
  status: string;
  sent: boolean;
  sent_at: string | null;
  payment_milestones: {
    label: string;
    amount: number;
    status: string;
  };
}

interface InvoicesDashboardProps {
  scheduleId?: string;
  jobId?: string;
}

export function InvoicesDashboard({
  scheduleId,
  jobId,
}: InvoicesDashboardProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, [scheduleId, jobId]);

  const loadInvoices = async () => {
    try {
      const params = new URLSearchParams();
      if (scheduleId) params.append("schedule_id", scheduleId);
      if (jobId) params.append("job_id", jobId);

      const response = await fetch(`/api/invoices/list?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load invoices");

      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (error) {
      console.error("Error loading invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvoice = async (invoiceId: string) => {
    try {
      const response = await fetch("/api/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });

      if (!response.ok) throw new Error("Failed to send invoice");

      await loadInvoices();
      alert("Invoice sent successfully!");
    } catch (error: any) {
      alert(error.message || "Failed to send invoice");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      case "partially_paid":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid":
        return "🟢";
      case "overdue":
        return "🟠";
      case "partially_paid":
        return "🟡";
      default:
        return "⚪";
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Invoices Dashboard</h2>
        <Button onClick={loadInvoices} variant="outline">
          Refresh
        </Button>
      </div>

      {invoices.length === 0 ? (
        <div className="p-8 text-center border rounded-lg bg-gray-50">
          <p className="text-gray-600">No invoices found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-3 text-left text-sm font-semibold">Milestone</th>
                <th className="p-3 text-left text-sm font-semibold">Amount</th>
                <th className="p-3 text-left text-sm font-semibold">Due Date</th>
                <th className="p-3 text-left text-sm font-semibold">Status</th>
                <th className="p-3 text-left text-sm font-semibold">Invoice #</th>
                <th className="p-3 text-left text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    {invoice.payment_milestones?.label || "N/A"}
                  </td>
                  <td className="p-3 font-semibold">
                    ${invoice.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="p-3">
                    {invoice.due_date
                      ? new Date(invoice.due_date).toLocaleDateString()
                      : "N/A"}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        invoice.status
                      )}`}
                    >
                      {getStatusIcon(invoice.status)} {invoice.status}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-sm">
                    {invoice.invoice_number}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {!invoice.sent ? (
                        <Button
                          size="sm"
                          onClick={() => handleSendInvoice(invoice.id)}
                        >
                          Send
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSendInvoice(invoice.id)}
                        >
                          Resend
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          window.open(`/pay/invoice/${invoice.id}`, "_blank")
                        }
                      >
                        View
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

























