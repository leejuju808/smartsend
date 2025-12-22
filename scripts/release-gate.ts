import { createClient } from "@supabase/supabase-js";
import { LAUNCH_MODE, LAUNCH_MODE_BYPASS } from "@/lib/launch-mode";

/**
 * BLOCK 291000 — Release Gate (enforced under LAUNCH_MODE)
 *
 * Deploy allowed only if:
 * - critical = 0 (status != verified)
 * - high <= 3  (status != verified)
 * - payment flow verified (last 24h, ok=true)
 * - send flow verified (last 24h, ok=true)
 *
 * Enforcement is only activated in CI/Vercel contexts to avoid blocking local builds.
 */

function isEnforcementContext() {
  return process.env.VERCEL === "1" || process.env.CI === "true";
}

function withinHours(iso: string | null | undefined, hours: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= hours * 60 * 60 * 1000;
}

async function latestFlowOk(sb: any, action: string) {
  const { data, error } = await sb
    .from("audit_logs")
    .select("created_at, meta")
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { verified: false, ok: false, at: null as string | null, reason: error?.message ?? "missing" };
  const ok = !!(data as any)?.meta?.ok;
  const at = (data as any)?.created_at ?? null;
  const verified = ok && withinHours(at, 24);
  const reason = (data as any)?.meta?.reason ?? null;
  return { verified, ok, at, reason };
}

async function main() {
  if (!LAUNCH_MODE || LAUNCH_MODE_BYPASS || !isEnforcementContext()) {
    process.exit(0);
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    // In enforcement contexts, missing credentials is a hard failure (prevents bypass).
    // eslint-disable-next-line no-console
    console.error("RELEASE GATE: missing SUPABASE url/service role key.");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const [{ count: criticalOpen, error: critErr }, { count: highOpen, error: highErr }] = await Promise.all([
    sb
      .from("bug_reports")
      .select("id", { count: "exact", head: true })
      .eq("severity", "critical")
      .in("status", ["open", "in_progress", "fixed"]),
    sb
      .from("bug_reports")
      .select("id", { count: "exact", head: true })
      .eq("severity", "high")
      .in("status", ["open", "in_progress", "fixed"]),
  ]);

  if (critErr || highErr) {
    // eslint-disable-next-line no-console
    console.error("RELEASE GATE: failed to query bug_reports:", critErr?.message || highErr?.message);
    process.exit(1);
  }

  const critical = criticalOpen ?? 0;
  const high = highOpen ?? 0;

  const sendFlow = await latestFlowOk(sb, "release_gate_send_flow");
  const paymentFlow = await latestFlowOk(sb, "release_gate_payment_flow");

  const ok = critical === 0 && high <= 3 && sendFlow.verified && paymentFlow.verified;

  if (ok) {
    // eslint-disable-next-line no-console
    console.log("RELEASE GATE: PASS");
    process.exit(0);
  }

  // eslint-disable-next-line no-console
  console.error(
    [
      "RELEASE GATE: BLOCKED",
      `- critical(open): ${critical} (must be 0)`,
      `- high(open): ${high} (must be <= 3)`,
      `- send flow verified: ${sendFlow.verified ? "yes" : "no"} (last=${sendFlow.at ?? "none"})`,
      `- payment flow verified: ${paymentFlow.verified ? "yes" : "no"} (last=${paymentFlow.at ?? "none"})`,
      "",
      "Fix bugs / verify flows at /dashboard/admin/bug-bash.",
    ].join("\n"),
  );
  process.exit(1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("RELEASE GATE: exception", e);
  process.exit(1);
});









