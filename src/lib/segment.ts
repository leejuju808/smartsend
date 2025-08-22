import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export type Segment = {
  tagsAny?: string[];
  includeDomains?: string[];
  excludeDomains?: string[];
  includeUnsubscribed?: boolean;
  search?: string;
};

export async function resolveSegmentCount(seg: Segment) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  let q = supabase.from("contacts").select("id,email_lower,tags,unsubscribed", { count: "exact", head: true }).eq("user_id", user.id);

  if (!seg.includeUnsubscribed) q = q.eq("unsubscribed", false);
  if (seg.tagsAny?.length) q = q.contains("tags", seg.tagsAny);
  if (seg.search?.trim()) q = q.ilike("email", `%${seg.search.trim()}%`);
  if (seg.includeDomains?.length) q = q.or(seg.includeDomains.map(d => `email.ilike.%@${d}`).join(","));
  if (seg.excludeDomains?.length) q = q.not("email", "ilike", `%@${seg.excludeDomains[0]}`);
  const { count } = await q;
  return count || 0;
}

