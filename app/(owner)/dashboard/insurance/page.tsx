"use client";

// Block 66000 — SmartSend Roofing "Insurance Claim Assistant + Scope Verification AI System" v1
// Full Insurance Claim Management Page

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

type InsuranceScope = {
  id: string;
  job_id: string;
  scope_pdf_url: string;
  extracted_data: any;
  insurance_company: string | null;
  claim_number: string | null;
  adjuster_name: string | null;
  adjuster_email: string | null;
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

export default function InsuranceClaimPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [scope, setScope] = useState<InsuranceScope | null>(null);
  const [verification, setVerification] = useState<ScopeVerification | null>(null);
  const [supplements, setSupplements] = useState<SupplementSubmission[]>([]);
  const [claimStrategy, setClaimStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [generatingSupplement, setGeneratingSupplement] = useState(false);
  const [generatingPacket, setGeneratingPacket] = useState(false);
  const [generatingStrategy, setGeneratingStrategy] = useState(false);
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
        .limit(50);

      if (jobsData) {
        setJobs(jobsData);
        if (jobsData.length > 0 && !selectedJobId) {
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
      }

      // Load supplements
      const { data: supplementsData } = await supabase
        .from("supplement_submissions")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      setSupplements(supplementsData || []);
    } catch (error) {
      console.error("Error loading claim data:", error);
    }
  };

  const handleUploadScope = async (file: File) => {
    if (!selectedJobId || !workspaceId) return;

    setUploading(true);
    try {
      const fileName = `${workspaceId}/${selectedJobId}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("insurance-scopes")
        .upload(fileName, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

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

    setGeneratingSupplement(true);
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
    } finally {
      setGeneratingSupplement(false);
    }
  };

  const handleGeneratePacket = async () => {
    if (!selectedJobId || !verification) return;

    setGeneratingPacket(true);
    try {
      const response = await fetch("/api/claim/packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: selectedJobId,
          scope_verification_id: verification.id,
          packet_type: "full",
        }),
      });

      if (!response.ok) throw new Error("Failed to generate packet");

      const result = await response.json();
      alert("Claim packet generated successfully!");
    } catch (error) {
      console.error("Error generating packet:", error);
      alert("Failed to generate packet. Please try again.");
    } finally {
      setGeneratingPacket(false);
    }
  };

  const handleGenerateStrategy = async () => {
    if (!selectedJobId || !verification) return;

    setGeneratingStrategy(true);
    try {
      const response = await fetch("/api/claim/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: selectedJobId,
          scope_verification_id: verification.id,
        }),
      });

      if (!response.ok) throw new Error("Failed to generate strategy");

      const result = await response.json();
      setClaimStrategy(result.strategy);
    } catch (error) {
      console.error("Error generating strategy:", error);
      alert("Failed to generate strategy. Please try again.");
    } finally {
      setGeneratingStrategy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-400">Loading insurance claims...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Insurance Claim Assistant</h1>
          <p className="text-sm text-gray-400">
            AI Scope Checker • Missing Line Item Detection • Supplement Recommendations
          </p>
        </div>
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Job Selector */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <label className="text-sm text-gray-300 mb-2 block">Select Insurance Job:</label>
        <select
          value={selectedJobId || ""}
          onChange={(e) => setSelectedJobId(e.target.value)}
          className="w-full rounded-lg bg-black/40 border border-white/10 p-2 text-sm text-white"
        >
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              Job {job.id.slice(0, 8)}... - ${job.contract_value?.toLocaleString() || 0}
            </option>
          ))}
        </select>
      </div>

      {selectedJobId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Scope & Verification */}
          <div className="space-y-4">
            {/* Scope Upload */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
              <h2 className="text-lg font-semibold text-white">Insurance Scope</h2>
              {!scope ? (
                <div className="space-y-2">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadScope(file);
                    }}
                    disabled={uploading}
                    className="text-sm"
                  />
                  {uploading && <div className="text-xs text-gray-400">Uploading...</div>}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-gray-300">
                    <div>Claim #: {scope.claim_number || "N/A"}</div>
                    <div>Insurance: {scope.insurance_company || "Unknown"}</div>
                    <div>Adjuster: {scope.adjuster_name || "N/A"}</div>
                    <div>Scope Value: ${scope.total_scope_value?.toLocaleString() || 0}</div>
                  </div>
                  {!verification && (
                    <Button
                      onClick={handleVerify}
                      disabled={verifying}
                      className="w-full"
                    >
                      {verifying ? "Verifying..." : "Verify Scope"}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Verification Results */}
            {verification && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <h2 className="text-lg font-semibold text-white">Verification Results</h2>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-red-500/20 border border-red-500/40 p-2">
                    <div className="text-xs text-gray-400">Total Underpayment</div>
                    <div className="text-lg font-semibold text-red-400">
                      ${verification.total_estimated_underpayment.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg bg-yellow-500/20 border border-yellow-500/40 p-2">
                    <div className="text-xs text-gray-400">Missing Items</div>
                    <div className="text-lg font-semibold text-yellow-400">
                      {verification.missing_items.length}
                    </div>
                  </div>
                </div>

                {/* Missing Items */}
                {verification.missing_items.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-yellow-300">Missing Items:</h3>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {verification.missing_items.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="rounded-lg bg-black/40 border border-white/10 p-2 text-xs"
                        >
                          <div className="font-medium text-white">{item.item || item.description}</div>
                          <div className="text-gray-400">
                            Qty: {item.quantity} {item.unit} • ${item.total_price || item.impact || 0}
                          </div>
                          {item.reason && (
                            <div className="text-gray-500 mt-1">{item.reason}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Summary */}
                {verification.ai_summary && (
                  <div className="rounded-lg bg-black/40 border border-white/10 p-2">
                    <div className="text-xs font-medium text-white mb-1">AI Summary</div>
                    <div className="text-xs text-gray-300">{verification.ai_summary}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Supplements & Strategy */}
          <div className="space-y-4">
            {/* Supplement Recommendations */}
            {verification && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <h2 className="text-lg font-semibold text-white">Supplements</h2>
                {verification.recommended_supplements.length > 0 ? (
                  <div className="space-y-2">
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {verification.recommended_supplements.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="rounded-lg bg-green-500/20 border border-green-500/40 p-2 text-xs"
                        >
                          <div className="font-medium text-white">{item.item || item.description}</div>
                          <div className="text-gray-300">
                            ${item.total_price || 0} • {item.justification}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={handleGenerateSupplement}
                      disabled={generatingSupplement}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      {generatingSupplement ? "Generating..." : "Generate Supplement Document"}
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">
                    No supplements recommended yet. Verify scope first.
                  </div>
                )}
              </div>
            )}

            {/* Claim Strategy */}
            {verification && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <h2 className="text-lg font-semibold text-white">Claim Strategy</h2>
                {!claimStrategy ? (
                  <Button
                    onClick={handleGenerateStrategy}
                    disabled={generatingStrategy}
                    className="w-full"
                  >
                    {generatingStrategy ? "Generating..." : "Generate Claim Strategy"}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-medium text-white mb-1">What's Wrong:</h3>
                      <div className="text-xs text-gray-300">{claimStrategy.whats_wrong}</div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-white mb-1">Talking Points:</h3>
                      <ul className="text-xs text-gray-300 space-y-1">
                        {claimStrategy.talking_points?.map((point: string, idx: number) => (
                          <li key={idx}>• {point}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-white mb-1">Expected Outcome:</h3>
                      <div className="text-xs text-gray-300">{claimStrategy.expected_outcome}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {verification && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
                <h2 className="text-lg font-semibold text-white">Actions</h2>
                <Button
                  onClick={handleGeneratePacket}
                  disabled={generatingPacket}
                  className="w-full"
                >
                  {generatingPacket ? "Generating..." : "Generate Claim Packet PDF"}
                </Button>
              </div>
            )}

            {/* Supplement Submissions */}
            {supplements.length > 0 && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <h2 className="text-lg font-semibold text-white">Supplement Submissions</h2>
                <div className="space-y-2">
                  {supplements.map((supp) => (
                    <div
                      key={supp.id}
                      className="rounded-lg bg-black/40 border border-white/10 p-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-white">
                          ${supp.total_supplement_value.toLocaleString()}
                        </div>
                        <Badge
                          variant={
                            supp.status === "approved"
                              ? "default"
                              : supp.status === "rejected"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {supp.status}
                        </Badge>
                      </div>
                      {supp.approval_amount && (
                        <div className="text-xs text-gray-400 mt-1">
                          Approved: ${supp.approval_amount.toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}




























