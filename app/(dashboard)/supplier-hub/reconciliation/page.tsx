// Block 241000 — SmartSend Roofing Supplier Hub v1
// Reconciliation Dashboard

"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ReconciliationPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string>("");
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    async function getCompany() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: companies } = await supabase
          .from("roofing_companies")
          .select("id")
          .eq("owner_id", user.id)
          .eq("is_active", true)
          .limit(1);
        
        if (companies && companies.length > 0) {
          setCompanyId(companies[0].id);
        }
      }
    }
    getCompany();
  }, [supabase]);

  const { data, error, mutate } = useSWR<{ reconciliation: any }>(
    jobId && companyId
      ? `/api/supplier/reconcile?job_id=${jobId}&company_id=${companyId}`
      : null,
    fetcher
  );

  const handleReconcile = async () => {
    if (!jobId) {
      alert("Please enter a job ID");
      return;
    }

    setReconciling(true);
    try {
      const response = await fetch("/api/supplier/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });

      if (!response.ok) {
        throw new Error("Failed to reconcile");
      }

      mutate();
    } catch (error: any) {
      alert(error.message || "Failed to reconcile");
    } finally {
      setReconciling(false);
    }
  };

  const reconciliation = data?.reconciliation;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Cost Reconciliation</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Compare estimated costs, PO costs, and actual invoice costs
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <Label>Job ID</Label>
            <Input
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="Enter job ID"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleReconcile} disabled={reconciling || !jobId}>
              {reconciling ? "Reconciling..." : "Reconcile"}
            </Button>
          </div>
        </div>
      </div>

      {reconciliation && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-sm text-zinc-400">Estimated Cost</div>
            <div className="mt-2 text-2xl font-semibold">
              ${reconciliation.estimated_cost?.toFixed(2) || "0.00"}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-sm text-zinc-400">PO Total Cost</div>
            <div className="mt-2 text-2xl font-semibold">
              ${reconciliation.po_total_cost?.toFixed(2) || "0.00"}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-sm text-zinc-400">Invoice Total</div>
            <div className="mt-2 text-2xl font-semibold">
              ${reconciliation.invoice_total?.toFixed(2) || "0.00"}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-sm text-zinc-400">Variance</div>
            <div className={`mt-2 text-2xl font-semibold flex items-center gap-2 ${
              (reconciliation.variance || 0) > 0 ? "text-red-400" : "text-green-400"
            }`}>
              {reconciliation.variance && reconciliation.variance > 0 ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )}
              ${Math.abs(reconciliation.variance || 0).toFixed(2)}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-sm text-zinc-400">Variance %</div>
            <div className={`mt-2 text-2xl font-semibold ${
              Math.abs(reconciliation.variance_percent || 0) > 5 ? "text-red-400" : "text-zinc-50"
            }`}>
              {reconciliation.variance_percent?.toFixed(2) || "0.00"}%
            </div>
            {Math.abs(reconciliation.variance_percent || 0) > 5 && (
              <div className="mt-2 flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Significant variance
              </div>
            )}
          </div>
        </div>
      )}

      {!reconciliation && !error && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <TrendingUp className="h-12 w-12 mx-auto text-zinc-600 mb-4" />
          <p className="text-zinc-400">
            Enter a job ID and click Reconcile to see cost analysis
          </p>
        </div>
      )}
    </div>
  );
}

























