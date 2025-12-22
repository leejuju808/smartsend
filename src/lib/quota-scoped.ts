import { createClient } from "@supabase/supabase-js";

export async function checkAndConsumeScoped(userId: string, orgId: string | null, count: number) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("consume_send_quota_scoped", { p_user: userId, p_org: orgId, p_count: count });
  if (error) return { ok: false, message: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    const scope = row?.scope === 'org' ? 'team quota' : row?.scope === 'user' ? 'personal quota' : 'quota';
    return { ok: false, message: `Limit reached on ${scope}. ${row.remaining}/${row.limit} left for ${row.period_key}.` };
  }
  return { ok: true };
}


