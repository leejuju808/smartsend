import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAutopilotSystemOverride } from "@/lib/autopilot/guard";

export type DeviationReason = "capacity_change" | "crew_change" | "geographic_expansion";

export type ProvenPathLock = {
  locked: boolean;
  locked_at: string | null;
  snapshot?: any;
  metrics?: any;
};

const allowedReasons: readonly DeviationReason[] = ["capacity_change", "crew_change", "geographic_expansion"] as const;

export function isValidDeviationReason(v: unknown): v is DeviationReason {
  return allowedReasons.includes(String(v || "") as any);
}

export async function getProvenPathLock(workspaceId: string): Promise<ProvenPathLock> {
  if (!workspaceId) return { locked: false, locked_at: null };
  try {
    const { data, error } = await supabaseAdmin
      .from("ss_proven_path_locks")
      .select("workspace_id, locked_at, snapshot, metrics")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { locked: false, locked_at: null };
    return {
      locked: true,
      locked_at: (data as any)?.locked_at ?? null,
      snapshot: (data as any)?.snapshot ?? {},
      metrics: (data as any)?.metrics ?? {},
    };
  } catch {
    // Older DBs might not have the table yet.
    return { locked: false, locked_at: null };
  }
}

export async function createDeviationRequest(opts: {
  workspaceId: string;
  createdBy: string | null;
  reason: DeviationReason;
  target: string;
  requestedChanges: any;
  evidence?: any;
}): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("ss_deviation_requests")
      .insert({
        workspace_id: opts.workspaceId,
        created_by: opts.createdBy,
        reason: opts.reason,
        target: opts.target,
        requested_changes: opts.requestedChanges ?? {},
        evidence: opts.evidence ?? {},
        status: "pending",
      } as any)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return data ? String((data as any).id) : null;
  } catch {
    return null;
  }
}

export async function blockIfProvenPathLocked(opts: {
  req: NextRequest;
  workspaceId: string;
  action: string;
  createdBy: string | null;
  reason: DeviationReason;
  requestedChanges: any;
  target: string;
  evidence?: any;
}): Promise<{ blocked: true; response: NextResponse } | { blocked: false; lock: ProvenPathLock }> {
  const lock = await getProvenPathLock(opts.workspaceId);
  if (!lock.locked) return { blocked: false, lock };

  // Allow system override (same mechanism as AUTOPILOT) to make automated ops changes.
  if (isAutopilotSystemOverride(opts.req)) return { blocked: false, lock };

  const deviationId = await createDeviationRequest({
    workspaceId: opts.workspaceId,
    createdBy: opts.createdBy,
    reason: opts.reason,
    target: opts.target,
    requestedChanges: opts.requestedChanges,
    evidence: opts.evidence,
  });

  return {
    blocked: true,
    response: NextResponse.json(
      {
        error: "System performance indicates continuation.",
        action: opts.action,
        proven_path: lock,
        deviation_request_id: deviationId,
      },
      { status: 423 }
    ),
  };
}



