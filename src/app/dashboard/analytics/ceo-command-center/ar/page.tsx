"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { createClientComponentClient } from "@/lib/supabase";
import Link from "next/link";
import { ArrowLeft, Send, AlertCircle } from "lucide-react";

type ARData = {
  summary: {
    totalAr: number;
    overdueAr: number;
    overdueCount: number;
    totalInvoices: number;
  };
  invoices: Array<{
    invoiceId: string;
    jobId: string;
    jobTitle: string;
    homeownerName: string;
    jobAddress: string;
    amount: number;
    amountDue: number;
    dueDate: string | null;
    daysOverdue: number;
    status: string;
    sentAt: string | null;
  }>;
};

export default function AccountsReceivablePage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [arData, setArData] = useState<ARData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const activeWorkspace = typeof window !== "undefined" 
          ? localStorage.getItem('active_workspace') 
          : null;
        
        if (activeWorkspace) {
          setWorkspaceId(activeWorkspace);
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: workspace } = await supabase
              .from('workspace_members')
              .select('workspace_id')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle();
            
            if (workspace) {
              setWorkspaceId(workspace.workspace_id);
            }
          }
        }
      } catch (error) {
        console.error('Error loading workspace:', error);
        setLoading(false);
      }
    };

    loadWorkspace();
  }, [supabase]);

  useEffect(() => {
    if (!workspaceId) return;

    const loadAR = async () => {
      try {
        const res = await fetch(`/api/analytics/ceo-dashboard/accounts-receivable?wid=${workspaceId}`);
        if (!res.ok) throw new Error("Failed to fetch AR data");
        const data = await res.json();
        setArData(data);
      } catch (error) {
        console.error("Error loading AR:", error);
      } finally {
        setLoading(false);
      }
    };

    loadAR();
  }, [workspaceId]);

  const handleSendReminder = async (invoiceId: string) => {
    if (!workspaceId) return;
    
    setSendingReminder(invoiceId);
    try {
      const res = await fetch(`/api/analytics/ceo-dashboard/accounts-receivable?wid=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      
      if (res.ok) {
        // Reload AR data
        const data = await res.json();
        if (data.success) {
          // Refresh the page data
          const arRes = await fetch(`/api/analytics/ceo-dashboard/accounts-receivable?wid=${workspaceId}`);
          if (arRes.ok) {
            const arData = await arRes.json();
            setArData(arData);
          }
        }
      }
    } catch (error) {
      console.error("Error sending reminder:", error);
    } finally {
      setSendingReminder(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading accounts receivable...</div>
      </div>
    );
  }

  if (!arData) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">No data available.</div>
      </div>
    );
  }

  const overdueInvoices = arData.invoices.filter(inv => inv.daysOverdue > 0);
  const upcomingInvoices = arData.invoices.filter(inv => inv.daysOverdue === 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/analytics/ceo-command-center">
            <ArrowLeft className="h-5 w-5 cursor-pointer" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Accounts Receivable</h1>
            <p className="text-muted-foreground mt-1">
              Unpaid invoices, overdue tracking, payment reminders
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Total A/R</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(arData.summary.totalAr)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {arData.summary.totalInvoices} invoices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Overdue A/R</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(arData.summary.overdueAr)}
            </div>
            {arData.summary.overdueCount > 0 && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {arData.summary.overdueCount} overdue invoices
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Overdue Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {arData.summary.overdueCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Invoices past due</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Current A/R</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(arData.summary.totalAr - arData.summary.overdueAr)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Not yet overdue</p>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Invoices */}
      {overdueInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Overdue Invoices ({overdueInvoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Customer</th>
                    <th className="text-left p-2">Job</th>
                    <th className="text-right p-2">Amount Due</th>
                    <th className="text-right p-2">Due Date</th>
                    <th className="text-right p-2">Days Overdue</th>
                    <th className="text-center p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueInvoices.map((inv) => (
                    <tr key={inv.invoiceId} className="border-b hover:bg-muted/50">
                      <td className="p-2">
                        <div className="font-medium">{inv.homeownerName || "N/A"}</div>
                        <div className="text-xs text-muted-foreground">{inv.jobAddress || ""}</div>
                      </td>
                      <td className="p-2">
                        <div>{inv.jobTitle || "Untitled Job"}</div>
                        <div className="text-xs text-muted-foreground">{inv.jobId.slice(0, 8)}</div>
                      </td>
                      <td className="text-right p-2 font-medium">
                        {formatCurrency(inv.amountDue)}
                      </td>
                      <td className="text-right p-2">{formatDate(inv.dueDate)}</td>
                      <td className="text-right p-2">
                        <span className="text-red-600 font-medium">
                          {inv.daysOverdue} days
                        </span>
                      </td>
                      <td className="text-center p-2">
                        <button
                          onClick={() => handleSendReminder(inv.invoiceId)}
                          disabled={sendingReminder === inv.invoiceId}
                          className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
                        >
                          <Send className="h-3 w-3" />
                          {sendingReminder === inv.invoiceId ? "Sending..." : "Send Reminder"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Invoices */}
      {upcomingInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Invoices ({upcomingInvoices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Customer</th>
                    <th className="text-left p-2">Job</th>
                    <th className="text-right p-2">Amount Due</th>
                    <th className="text-right p-2">Due Date</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingInvoices.map((inv) => (
                    <tr key={inv.invoiceId} className="border-b hover:bg-muted/50">
                      <td className="p-2">
                        <div className="font-medium">{inv.homeownerName || "N/A"}</div>
                        <div className="text-xs text-muted-foreground">{inv.jobAddress || ""}</div>
                      </td>
                      <td className="p-2">
                        <div>{inv.jobTitle || "Untitled Job"}</div>
                        <div className="text-xs text-muted-foreground">{inv.jobId.slice(0, 8)}</div>
                      </td>
                      <td className="text-right p-2 font-medium">
                        {formatCurrency(inv.amountDue)}
                      </td>
                      <td className="text-right p-2">{formatDate(inv.dueDate)}</td>
                      <td className="text-center p-2">
                        <span className="px-2 py-1 rounded text-xs bg-muted">
                          {inv.status || "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

























