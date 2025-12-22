// Block 223000 — Material List Generator + Supplier Order Integration
// Materials Tab V2 - Full Material List + Supplier Order System

"use client";

import { useState, useEffect } from "react";
import { MaterialListEditor } from "./MaterialListEditor";
import { SupplierOrdersView } from "./SupplierOrdersView";
import { createClient } from "@/lib/supabase/client";

interface MaterialsTabV2Props {
  jobId: string;
}

export function MaterialsTabV2({ jobId }: MaterialsTabV2Props) {
  const supabase = createClient();
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [materialListId, setMaterialListId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobData();
  }, [jobId]);

  const loadJobData = async () => {
    setLoading(true);
    try {
      // Try to find estimate linked to this job
      // Check estimates_job_links first
      const { data: jobLink } = await supabase
        .from("estimates_job_links")
        .select("contract_id, estimates_contracts!inner(proposal_id, estimates_proposals!inner(estimate_id))")
        .eq("job_id", jobId)
        .maybeSingle();

      let foundEstimateId: string | null = null;

      if (jobLink) {
        const contract = (jobLink as any).estimates_contracts;
        if (contract?.estimates_proposals?.estimate_id) {
          foundEstimateId = contract.estimates_proposals.estimate_id;
        }
      }

      // If no estimate found via job links, try direct job estimate
      if (!foundEstimateId) {
        const { data: estimate } = await supabase
          .from("estimates")
          .select("id")
          .eq("company_id", (await supabase.from("roofing_jobs").select("workspace_id").eq("id", jobId).single()).data?.workspace_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (estimate) {
          foundEstimateId = estimate.id;
        }
      }

      if (foundEstimateId) {
        setEstimateId(foundEstimateId);
      }

      // Check for existing material list
      const { data: materialList } = await supabase
        .from("material_lists")
        .select("id")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (materialList) {
        setMaterialListId(materialList.id);
      }
    } catch (error) {
      console.error("Error loading job data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialListCreated = (newMaterialListId: string) => {
    setMaterialListId(newMaterialListId);
  };

  const handleOrderUpdate = () => {
    // Refresh data if needed
    loadJobData();
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-sm text-zinc-400">Loading materials...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Material List Editor */}
      <MaterialListEditor
        jobId={jobId}
        estimateId={estimateId || undefined}
        materialListId={materialListId || undefined}
        onSave={() => {
          loadJobData();
        }}
      />

      {/* Supplier Orders View */}
      {materialListId && (
        <SupplierOrdersView
          jobId={jobId}
          materialListId={materialListId}
          onOrderUpdate={handleOrderUpdate}
        />
      )}
    </div>
  );
}

























