"use client";

// Block 26200 — SmartSend Roofing AR/AP Collections Engine v1
// Job Collections Card Component
// Shows "Money Owed / Money Paid" card on each job page

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";

interface JobCollectionsCardProps {
  jobId: string;
}

type InvoiceBalance = {
  invoice_id: string;
  job_id: string;
  payer_type: "homeowner" | "insurance" | "other";
  payer_name: string | null;
  payer_email: string | null;
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

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: "red" | "green" }) {
  const color =
    highlight === "red"
      ? "text-red-600 font-bold"
      : highlight === "green"
      ? "text-green-600 font-bold"
      : "";

  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg ${color}`}>{value}</div>
    </div>
  );
}

export function JobCollectionsCard({ jobId }: JobCollectionsCardProps) {
  const [invoices, setInvoices] = useState<InvoiceBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchInvoices();
  }, [jobId]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("roofing_invoice_balances")
        .select("*")
        .eq("job_id", jobId)
        .order("due_date", { ascending: true, nullsLast: true });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Collections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const totalInvoice = invoices.reduce((s, i) => s + Number(i.invoice_amount), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid), 0);
  const totalBalance = invoices.reduce((s, i) => s + Number(i.balance_due), 0);

  return (
    <Card className="rounded-xl border bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="font-bold text-lg flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Collections
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Metric label="Total Invoiced" value={formatCurrency(totalInvoice)} />
          <Metric label="Total Collected" value={formatCurrency(totalPaid)} />
          <Metric
            label="Balance Due"
            value={formatCurrency(totalBalance)}
            highlight={totalBalance > 0 ? "red" : "green"}
          />
        </div>

        {invoices.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No invoices yet for this job.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Invoice</th>
                  <th className="pb-2">Payer</th>
                  <th className="pb-2">Due</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoice_id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2">
                      {inv.invoice_number || inv.invoice_id.slice(0, 8)}
                    </td>
                    <td className="py-2">
                      {inv.payer_name || inv.payer_email || inv.payer_type}
                    </td>
                    <td className="py-2">
                      {inv.due_date
                        ? new Date(inv.due_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-2">
                      {getStatusBadge(inv.status)}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {formatCurrency(Number(inv.balance_due))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}



































