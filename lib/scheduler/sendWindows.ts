import { supabaseAdmin } from "@/lib/supabase-admin";

type Candidate = {
  lead_id: string;
  to_email: string;
  campaign_id?: string;
};

type DomainAllowance = {
  remaining: number;
};

function ispBucketForEmail(email: string) {
  const dom = email.split("@")[1]?.toLowerCase() ?? "";
  if (/gmail\.com|googlemail\.com|gtempaccount\.com/.test(dom)) return "gmail";
  if (/outlook\.com|hotmail\./.test(dom) || /live\.|office365\.|microsoft\.com/.test(dom)) return "outlook";
  if (/yahoo\.|ymail\.com|rocketmail\.com/.test(dom)) return "yahoo";
  return "other";
}

async function getDomainAllowance(accountId: string, domain: string): Promise<DomainAllowance> {
  try {
    const { data, error } = await supabaseAdmin.rpc("rpc_domain_allowance", {
      p_account_id: accountId,
      p_domain: domain,
    });

    if (error) throw error;

    if (Array.isArray(data) && data.length > 0 && typeof data[0]?.remaining === "number") {
      return { remaining: data[0].remaining };
    }

    if (data && typeof (data as any).remaining === "number") {
      return { remaining: (data as any).remaining };
    }
  } catch (error) {
    console.warn("[sendWindows] rpc_domain_allowance failed", error);
  }

  return { remaining: Number.MAX_SAFE_INTEGER };
}

async function consumeDomainAllowance(accountId: string, domain: string, count: number) {
  try {
    const { error } = await supabaseAdmin.rpc("rpc_consume_domain_allowance", {
      p_account_id: accountId,
      p_domain: domain,
      p_count: count,
    });

    if (error) throw error;
  } catch (error) {
    console.warn("[sendWindows] rpc_consume_domain_allowance failed", error);
  }
}

export async function scheduleBatch(accountId: string, candidates: Candidate[]) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { enqueued: 0 };
  }

  const sendable: Candidate[] = [];
  for (const candidate of candidates) {
    const { data, error } = await supabaseAdmin.rpc("rpc_lead_is_sendable_now", {
      p_lead_id: candidate.lead_id,
    });

    if (error) {
      console.error("[sendWindows] rpc_lead_is_sendable_now error", error);
      continue;
    }

    if (data === true) {
      sendable.push(candidate);
    }
  }

  if (!sendable.length) {
    return { enqueued: 0 };
  }

  const byDomain = new Map<string, Candidate[]>();
  for (const candidate of sendable) {
    const domain = candidate.to_email.split("@")[1]?.toLowerCase() ?? "";
    if (!domain) continue;
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(candidate);
  }

  let enqueued = 0;
  for (const [domain, list] of byDomain.entries()) {
    if (!list.length) continue;

    const bucket = ispBucketForEmail(list[0].to_email);
    const { remaining } = await getDomainAllowance(accountId, domain);
    if (remaining <= 0) {
      continue;
    }

    const { data: capRows, error: capError } = await supabaseAdmin.rpc("rpc_isp_minute_cap", {
      p_account_id: accountId,
      p_bucket: bucket,
    });

    if (capError) {
      console.error("[sendWindows] rpc_isp_minute_cap error", capError);
      continue;
    }

    const capRow = Array.isArray(capRows) ? capRows[0] : capRows;
    const used = Number(capRow?.used ?? 0);
    const cap = Number(capRow?.cap ?? 60);
    const minuteAvail = Math.max(0, cap - used);

    const take = Math.min(remaining, minuteAvail, list.length);
    if (take <= 0) {
      continue;
    }

    const batch = list.slice(0, take);

    // TODO: integrate with enqueue pipeline (Block 80/81)

    const { error: incError } = await supabaseAdmin.rpc("rpc_inc_isp_minute_counter", {
      p_account_id: accountId,
      p_bucket: bucket,
      p_minute: new Date().toISOString(),
      p_n: batch.length,
    });

    if (incError) {
      console.error("[sendWindows] rpc_inc_isp_minute_counter error", incError);
      continue;
    }

    await consumeDomainAllowance(accountId, domain, batch.length);
    enqueued += batch.length;
  }

  return { enqueued };
}

