"use client";

// Block 66000 — SmartSend Roofing "Insurance Claim Assistant + Scope Verification AI System" v1
// Insurance Command Center: AI Scope Checker • Missing Line Item Detection • Claim Document Builder • Supplement Recommendations

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type InsuranceScope = {
  id: string;
  job_id: string;
  scope_pdf_url: string;
  extracted_data: any;
  insurance_company: string | null;
  claim_number: string | null;
  adjuster_name: string | null;
  total_scope_value: number | null;
  created_at: string;
};

type ScopeVerification = {
  id: string;
  job_id: string;
  insurance_scope_id: string;
  missing_items: any[];
  incorrect_items: any[];
  code_violations: any[];
  recommended_supplements: any[];
  total_estimated_underpayment: number;
  missing_items_value: number;
  incorrect_items_value: number;
  code_upgrade_value: number;
  ai_summary: string | null;
  verification_status: string;
  created_at: string;
};

type SupplementSubmission = {
  id: string;
  job_id: string;
  supplement_items: any[];
  total_supplement_value: number;
  status: string;
  submitted_at: string | null;
  approval_amount: number | null;
  created_at: string;
};

type ClaimSummary = {
  has_scope: boolean;
  has_verification: boolean;
  total_underpayment: number;
  missing_items_count: number;
  supplements_pending: number;
  supplements_approved: number;
  total_recovered: number;
};

export function InsuranceCommandCenter() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [scope, setScope] = useState<InsuranceScope | null>(null);
  const [verification, setVerification] = useState<ScopeVerification | null>(null);
  const [supplements, setSupplements] = useState<SupplementSubmission[]>([]);
  const [claimSummary, setClaimSummary] = useState<ClaimSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: workspace } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();

          if (workspace) {
            setWorkspaceId(workspace.workspace_id);
            loadJobs(workspace.workspace_id);
          }
        }
      } catch (error) {
        console.error("Error loading workspace:", error);
        setLoading(false);
      }
    };

    loadWorkspace();
  }, [supabase]);

  const loadJobs = async (wsId: string) => {
    try {
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("*")
        .eq("insurance", true)
        .order("created_at", { ascending: false })
        .limit(20);

      if (jobsData && jobsData.length > 0) {
        setJobs(jobsData);
        if (!selectedJobId && jobsData[0]) {
          setSelectedJobId(jobsData[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedJobId && workspaceId) {
      loadClaimData(selectedJobId);
    }
  }, [selectedJobId, workspaceId]);

  const loadClaimData = async (jobId: string) => {
    try {
      // Load insurance scope
      const { data: scopeData } = await supabase
        .from("insurance_scopes")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setScope(scopeData || null);

      if (scopeData) {
        // Load verification
        const { data: verificationData } = await supabase
          .from("scope_verification")
          .select("*")
          .eq("insurance_scope_id", scopeData.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setVerification(verificationData || null);

        // Load supplements
        const { data: supplementsData } = await supabase
          .from("supplement_submissions")
          .select("*")
          .eq("job_id", jobId)
          .order("created_at", { ascending: false });

        setSupplements(supplementsData || []);
      }

      // Load claim summary
      const { data: summaryData } = await supabase.rpc("get_insurance_claim_summary", {
        p_job_id: jobId,
      });

      setClaimSummary(summaryData || null);
    } catch (error) {
      console.error("Error loading claim data:", error);
    }
  };

  const handleUploadScope = async (file: File) => {
    if (!selectedJobId || !workspaceId) return;

    setUploading(true);
    try {
      // Upload PDF to storage
      const fileName = `${workspaceId}/${selectedJobId}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("insurance-scopes")
        .upload(fileName, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Call API to extract and process
      const response = await fetch("/api/claim/upload-scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: selectedJobId,
          workspace_id: workspaceId,
          scope_pdf_url: fileName,
        }),
      });

      if (!response.ok) throw new Error("Failed to upload scope");

      const result = await response.json();
      await loadClaimData(selectedJobId);
    } catch (error) {
      console.error("Error uploading scope:", error);
      alert("Failed to upload scope. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedJobId || !scope) return;

    setVerifying(true);
    try {
      const response = await fetch("/api/claim/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: selectedJobId,
          insurance_scope_id: scope.id,
        }),
      });

      if (!response.ok) throw new Error("Failed to verify scope");

      await loadClaimData(selectedJobId);
    } catch (error) {
      console.error("Error verifying scope:", error);
      alert("Failed to verify scope. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleGenerateSupplement = async () => {
    if (!selectedJobId || !verification) return;

    try {
      const response = await fetch("/api/claim/generate-supplement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: selectedJobId,
          scope_verification_id: verification.id,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate supplement");

      await loadClaimData(selectedJobId);
    } catch (error) {
      console.error("Error generating supplement:", error);
      alert("Failed to generate supplement. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-gray-400">
        Loading insurance command center…
      </div>
    );
  }

  const pendingSupplements = supplements.filter((s) => s.status === "draft" || s.status === "submitted" || s.status === "pending");
  const approvedSupplements = supplements.filter((s) => s.status === "approved");

  return (
    <div className="rounded-xl bg-gradient-to-r from-blue-500/20 via-blue-400/10 to-transparent border border-blue-500/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-blue-300 tracking-wide">
            Insurance Claim Assistant
          </div>
          <div className="text-[11px] text-gray-300">
            AI Scope Checker • Missing Items • Supplements • Claim Builder
          </div>
        </div>
        <Link href="/dashboard/insurance">
          <Button variant="outline" size="sm" className="text-xs">
            Full Dashboard
          </Button>
        </Link>
      </div>

      {/* Job Selector */}
      {jobs.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs text-gray-400">Select Insurance Job:</label>
          <select
            value={selectedJobId || ""}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full rounded-lg bg-black/40 border border-white/10 p-2 text-sm text-white"
          >
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                Job {job.id.slice(0, 8)}... - ${job.contract_value || 0}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedJobId && (
        <>
          {/* Claim Summary */}
          {claimSummary && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-black/40 border border-white/10 p-2">
                <div className="text-[10px] text-gray-400">Total Underpayment</div>
                <div className="text-sm font-semibold text-red-400">
                  ${claimSummary.total_underpayment.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/10 p-2">
                <div className="text-[10px] text-gray-400">Missing Items</div>
                <div className="text-sm font-semibold text-yellow-400">
                  {claimSummary.missing_items_count}
                </div>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/10 p-2">
                <div className="text-[10px] text-gray-400">Pending Supplements</div>
                <div className="text-sm font-semibold text-blue-400">
                  {claimSummary.supplements_pending}
                </div>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/10 p-2">
                <div className="text-[10px] text-gray-400">Total Recovered</div>
                <div className="text-sm font-semibold text-green-400">
                  ${claimSummary.total_recovered.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Scope Upload */}
          {!scope && (
            <div className="rounded-lg bg-black/40 border border-white/10 p-3 space-y-2">
              <div className="text-xs font-medium text-white">Upload Insurance Scope</div>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadScope(file);
                }}
                disabled={uploading}
                className="text-xs"
              />
              {uploading && <div className="text-[10px] text-gray-400">Uploading...</div>}
            </div>
          )}

          {/* Scope Verification */}
          {scope && !verification && (
            <div className="rounded-lg bg-black/40 border border-white/10 p-3 space-y-2">
              <div className="text-xs font-medium text-white">Scope Uploaded</div>
              <div className="text-[10px] text-gray-400">
                Claim #{scope.claim_number || "N/A"} • {scope.insurance_company || "Unknown"}
              </div>
              <Button
                onClick={handleVerify}
                disabled={verifying}
                size="sm"
                className="w-full text-xs"
              >
                {verifying ? "Verifying..." : "Verify Scope"}
              </Button>
            </div>
          )}

          {/* Missing Items Alert */}
          {verification && verification.missing_items.length > 0 && (
            <div className="rounded-lg bg-yellow-500/20 border border-yellow-500/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-yellow-300">
                  ⚠️ Missing Items Detected
                </div>
                <Badge variant="outline" className="text-xs">
                  {verification.missing_items.length} items
                </Badge>
              </div>
              <div className="space-y-1">
                {verification.missing_items.slice(0, 3).map((item: any, idx: number) => (
                  <div key={idx} className="text-[10px] text-gray-300">
                    • {item.item || item.description} - ${item.total_price || item.impact || 0}
                  </div>
                ))}
              </div>
              {verification.missing_items.length > 3 && (
                <div className="text-[10px] text-gray-400">
                  +{verification.missing_items.length - 3} more items
                </div>
              )}
            </div>
          )}

          {/* Supplement Recommendations */}
          {verification && verification.recommended_supplements.length > 0 && (
            <div className="rounded-lg bg-green-500/20 border border-green-500/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-green-300">
                  Supplement Recommendations Ready
                </div>
                <Badge variant="outline" className="text-xs">
                  {verification.recommended_supplements.length} items
                </Badge>
              </div>
              <Button
                onClick={handleGenerateSupplement}
                size="sm"
                className="w-full text-xs bg-green-600 hover:bg-green-700"
              >
                Generate Supplement Document
              </Button>
            </div>
          )}

          {/* Supplements Status */}
          {supplements.length > 0 && (
            <div className="rounded-lg bg-black/40 border border-white/10 p-3 space-y-2">
              <div className="text-xs font-medium text-white">Supplement Status</div>
              <div className="space-y-1">
                {supplements.slice(0, 3).map((supp) => (
                  <div key={supp.id} className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-300">
                      ${supp.total_supplement_value.toLocaleString()}
                    </span>
                    <Badge
                      variant={
                        supp.status === "approved"
                          ? "default"
                          : supp.status === "rejected"
                          ? "destructive"
                          : "outline"
                      }
                      className="text-[9px]"
                    >
                      {supp.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Summary */}
          {verification?.ai_summary && (
            <div className="rounded-lg bg-black/40 border border-white/10 p-3">
              <div className="text-xs font-medium text-white mb-1">AI Analysis</div>
              <div className="text-[10px] text-gray-300">{verification.ai_summary}</div>
            </div>
          )}
        </>
      )}

      {jobs.length === 0 && (
        <div className="text-[11px] text-gray-400 py-2">
          No insurance jobs found. Create a job and mark it as insurance to get started.
        </div>
      )}
    </div>
  );
}




























