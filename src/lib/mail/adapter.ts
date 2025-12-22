import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { gmailSend } from "./gmail";
import { outlookSend } from "./outlook";
import { SendArgs, Provider } from "./types";

export async function getAccounts(orgId: string) {
  const supabase = createRouteHandlerClient({ cookies });
  // Note: Both gmail_accounts and outlook_accounts should have org_id and email columns per spec
  // If gmail_accounts still uses user_id, a migration is needed to add org_id
  const [{ data: g }, { data: o }] = await Promise.all([
    supabase.from("gmail_accounts").select("email, access_token").eq("org_id", orgId).maybeSingle(),
    supabase.from("outlook_accounts").select("email, access_token").eq("org_id", orgId).maybeSingle()
  ]);
  return { gmail: g ?? null, outlook: o ?? null };
}

export async function send(args: SendArgs & { provider?: "auto" | Provider }) {
  const supabase = createRouteHandlerClient({ cookies });

  // resolve org
  const orgId = args.orgId;
  const { gmail, outlook } = await getAccounts(orgId);

  let chosen: Provider | null = null;
  if (args.provider && args.provider !== "auto") chosen = args.provider;
  else chosen = gmail ? "gmail" : (outlook ? "outlook" : null);

  if (!chosen) throw new Error("No mail provider connected");

  let result: any;
  if (chosen === "gmail" && gmail) {
    result = await gmailSend(gmail, args);
  } else if (chosen === "outlook" && outlook) {
    result = await outlookSend(outlook, args);
  } else {
    throw new Error(`Provider ${chosen} not available`);
  }

  // Optional: echo outbound into replies/threads for immediate UI feedback
  // (Assumes you have thread_id resolution on the page; otherwise basic insert)
  const { data: lead } = await supabase
    .from("leads").select("id").ilike("email", args.to).limit(1).maybeSingle();
  if (lead?.id) {
    await supabase.from("replies").insert({
      lead_id: lead.id,
      subject: args.subject,
      body: args.body,
      raw_body: args.body,
      from_email: (gmail?.email ?? outlook?.email) ?? null,
      is_reply: true,
      is_read: true
    });
  }

  return { ok: true, provider: chosen, result };
}

export async function forceSync(orgId: string) {
  // Call whichever provider functions are deployed
  const secret = process.env.CRON_SECRET!;
  const base = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL!;
  const res = await Promise.allSettled([
    fetch(`${base}/gmail-sync`, { headers: { Authorization: `Bearer ${secret}` }}),
    fetch(`${base}/outlook-sync`, { headers: { Authorization: `Bearer ${secret}` }})
  ]);
  return res.map(r => (r.status === "fulfilled" ? "ok" : "err"));
}

