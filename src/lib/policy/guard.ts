import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type PolicySnapshot = {
  locked: boolean;
  locked_at: string | null;
};

function toBool(v: unknown): boolean {
  return v === true || String(v || "").toLowerCase() === "true";
}

export function isPolicySystemOverride(req: NextRequest): boolean {
  // Reuse the same system override mechanism as AUTOPILOT to avoid proliferating secrets.
  const expected = String(process.env.AUTOPILOT_SYSTEM_TOKEN || "").trim();
  if (!expected) return false;
  const token = String(req.headers.get("x-smartsend-system-token") || "").trim();
  return token && token === expected;
}

export async function getPolicySnapshot(workspaceId: string): Promise<PolicySnapshot> {
  // Best-effort: support older DBs that don't have the column yet.
  try {
    const { data, error } = await supabaseAdmin
      .from("workspaces")
      .select("institutional_policy_locked, institutional_policy_locked_at")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    return {
      locked: toBool((data as any)?.institutional_policy_locked),
      locked_at: ((data as any)?.institutional_policy_locked_at as string | null) ?? null,
    };
  } catch {
    return { locked: false, locked_at: null };
  }
}

export async function blockIfPolicyLocked(opts: {
  req: NextRequest;
  workspaceId: string;
  action: string;
}): Promise<{ blocked: true; response: NextResponse } | { blocked: false; snapshot: PolicySnapshot }> {
  const snapshot = await getPolicySnapshot(opts.workspaceId);
  if (!snapshot.locked) return { blocked: false, snapshot };
  if (isPolicySystemOverride(opts.req)) return { blocked: false, snapshot };

  return {
    blocked: true,
    response: NextResponse.json(
      {
        error: `Company policy: ${opts.action} is locked.`,
        policy: snapshot,
      },
      { status: 423 }
    ),
  };
}



