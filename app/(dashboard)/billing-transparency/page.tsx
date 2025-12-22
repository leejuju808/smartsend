"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function BillingTransparencyPage() {
  const supabase = createClientComponentClient();
  const [sub, setSub] = useState<any>(null);
  const [usage, setUsage] = useState<any[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { 
    loadWorkspaceAndData(); 
  }, []);

  async function loadWorkspaceAndData() {
    try {
      // Get active workspace from localStorage (set by dashboard layout)
      const activeWorkspace = localStorage.getItem('active_workspace');
      
      if (activeWorkspace) {
        setWorkspaceId(activeWorkspace);
        await loadBillingData(activeWorkspace);
      } else {
        // Fallback: get user's first workspace
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: workspace } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
          
          if (workspace?.workspace_id) {
            setWorkspaceId(workspace.workspace_id);
            await loadBillingData(workspace.workspace_id);
          }
        }
      }
    } catch (error) {
      console.error('Error loading workspace:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadBillingData(wsId: string) {
    const { data: s } = await supabase
      .from("billing_subscriptions")
      .select("*")
      .eq("workspace_id", wsId)
      .maybeSingle();
    
    const { data: u } = await supabase
      .from("billing_usage")
      .select("*")
      .eq("workspace_id", wsId)
      .eq("period_start", new Date().toISOString().slice(0, 7)); // Current month

    setSub(s || null);
    setUsage(u || []);
  }

  const openPortal = async () => {
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.location.href = url;
    } catch (e: any) {
      console.error("Could not open portal:", e.message);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Billing & Subscription</h1>

      {sub ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div><strong>Plan:</strong> {sub.plan.toUpperCase()}</div>
            <div><strong>Status:</strong> {sub.status}</div>
            <div>
              <strong>Period:</strong> {new Date(sub.current_period_start).toLocaleDateString()} → {new Date(sub.current_period_end).toLocaleDateString()}
            </div>
            <div><strong>Next Renewal:</strong> {new Date(sub.current_period_end).toLocaleDateString()}</div>
            {sub.cancel_at_period_end && (
              <div className="text-orange-600"><strong>⚠️ Cancels at period end</strong></div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4">
            <p>No active subscription found.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {usage.map((u) => (
          <Card key={u.metric}>
            <CardContent className="p-4">
              <h2 className="text-sm uppercase opacity-70 mb-2">
                {u.metric.replace('_', ' ')}
              </h2>
              <p className="text-2xl font-bold">{u.value}</p>
            </CardContent>
          </Card>
        ))}
        {usage.length === 0 && (
          <Card className="md:col-span-3">
            <CardContent className="p-4">
              <p className="text-sm opacity-70">No usage data for this period yet.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardContent className="p-4 flex justify-between items-center">
          <div>
            <h2 className="font-semibold">Manage Subscription</h2>
            <p className="text-sm opacity-70">Update payment method, view invoices, or cancel</p>
          </div>
          <Button onClick={openPortal}>Open Portal</Button>
        </CardContent>
      </Card>
    </div>
  );
}

