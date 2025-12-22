// Shared sendEmail helper with structured error responses
// Integrates with existing provider sending infrastructure

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailViaProvider, type Provider } from "./senders.ts";
import { getAccessToken } from "./oauth.ts";
import { localHeuristics, NormalizedError } from "./errorClassifier.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export async function sendEmail(args: {
  provider: "gmail" | "outlook";
  to: string;
  subject: string;
  body_html: string;
  account_id?: string; // Optional: if provided, use this account
  retry?: boolean;
  campaign_id?: string;
  queue_id?: string;
}): Promise<
  | { success: true }
  | { success: false; code?: string; error?: string; normalized: NormalizedError }
> {
  try {
    // If account_id is provided, fetch account details
    let account: any = null;
    if (args.account_id) {
      const { data: acct } = await supabase
        .from("connected_accounts")
        .select("id, provider, access_token, refresh_token, expires_at, email")
        .eq("id", args.account_id)
        .eq("provider", args.provider)
        .maybeSingle();
      
      if (!acct) {
        return { success: false, code: "account_not_found", error: "Account not found" };
      }
      account = acct;
    } else {
      // Try to find an account for this provider (fallback)
      const { data: accts } = await supabase
        .from("connected_accounts")
        .select("id, provider, access_token, refresh_token, expires_at, email")
        .eq("provider", args.provider)
        .limit(1);
      
      if (!accts || accts.length === 0) {
        return { success: false, code: "no_account", error: "No account available for provider" };
      }
      account = accts[0];
    }

    // Get fresh access token
    const tokenResult = await getAccessToken(account.id);
    const p = tokenResult.provider as Provider;
    const access_token = tokenResult.access_token;
    
    // Call the actual provider send function
    const result = await sendEmailViaProvider(p, {
      account: {
        id: account.id,
        provider: p,
        access_token: access_token,
        refresh_token: account.refresh_token,
        expires_at: account.expires_at,
        email: account.email,
        cooldown_until: null,
        meta: {},
      },
      to: args.to,
      subject: args.subject,
      html: args.body_html,
      text: null,
      inReplyToMessageId: null,
      threadId: null,
    });

    if (result.ok) {
      console.log(`Sent${args.retry ? " (retry)" : ""} → ${args.to} via ${args.provider}`);
      return { success: true };
    }

    // Extract error code and message
    const raw = result.errorCode || result.error || "Send failed";
    let code = "";
    if (/^\d{3}/.test(raw)) code = raw.match(/^(\d{3})/)?.[1] ?? "";
    
    // Classify using DB function (with fallback to local heuristics)
    const { data: classified, error: rpcErr } = await supabase.rpc("classify_provider_error", {
      p_provider: args.provider,
      p_code: code,
      p_message: raw
    });

    const normalized = classified && classified.length > 0 
      ? { kind: classified[0].kind, action: classified[0].action, permanent: classified[0].permanent }
      : localHeuristics(code, raw);

    // Log unknowns for learning loop
    if (normalized.kind === 'unknown') {
      await supabase.from("unknown_error_samples").insert({
        provider: args.provider,
        raw_code: code,
        raw_message: raw,
        account_id: args.account_id ?? null,
        campaign_id: args.campaign_id ?? null,
        queue_id: args.queue_id ?? null
      });
    }

    return { success: false, code, error: raw, normalized };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let code = "";
    if (/^\d{3}/.test(raw)) code = raw.match(/^(\d{3})/)?.[1] ?? "";
    
    // Classify using DB function (with fallback to local heuristics)
    const { data: classified, error: rpcErr } = await supabase.rpc("classify_provider_error", {
      p_provider: args.provider,
      p_code: code,
      p_message: raw
    });

    const normalized = classified && classified.length > 0 
      ? { kind: classified[0].kind, action: classified[0].action, permanent: classified[0].permanent }
      : localHeuristics(code, raw);

    // Log unknowns for learning loop
    if (normalized.kind === 'unknown') {
      await supabase.from("unknown_error_samples").insert({
        provider: args.provider,
        raw_code: code,
        raw_message: raw,
        account_id: args.account_id ?? null,
        campaign_id: args.campaign_id ?? null,
        queue_id: args.queue_id ?? null
      });
    }

    return { success: false, code, error: raw, normalized };
  }
}
