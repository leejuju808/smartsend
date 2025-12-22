import { getActiveOrg } from "@/lib/org";
import { createSupabaseServer } from "@/lib/supabaseServer";

export type Role = "owner" | "admin" | "member";

export function can(role: Role, ability: "invite" | "billing" | "write" | "read") {
  // Simple map; tweak as needed
  const map = {
    invite: ["owner", "admin"],
    billing: ["owner"],
    write: ["owner", "admin", "member"],  // allow all to write (adjust if needed)
    read: ["owner", "admin", "member"],
  } as const;
  return (map[ability] as Role[]).includes(role);
}

export async function requireRole(abilities: ("invite"|"billing"|"write"|"read")[]) {
  const org = await getActiveOrg();
  if (!org) return { ok: false as const, error: "no_org" };
  for (const ab of abilities) if (!can(org.role as Role, ab)) return { ok: false as const, error: "forbidden" };
  return { ok: true as const, org };
}

// server-side audit helper
export async function audit(action: string, target: { type?: string; id?: string }, meta: Record<string, any> = {}) {
  const sb = createSupabaseServer();
  const { org } = await requireRole(["read"]); // ensures org available + membership
  if (!org || !org.id) return;

  const { data: { user } } = await sb.auth.getUser();
  await sb.from("audit_logs").insert({
    org_id: org.id,
    user_id: user?.id ?? null,
    action,
    target_type: target.type ?? null,
    target_id: target.id ?? null,
    meta
  });
}