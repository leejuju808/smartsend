import { supabaseAdmin } from "@/server/supabase";

const ISP_RESOLVE_URL = process.env.ISP_RESOLVE_URL;

type QuietHoursConfig = {
  start?: string;
  end?: string;
  tz?: string;
};

export type IspCaps = {
  account_id: string;
  isp_key: string;
  hourly_cap: number;
  daily_cap: number;
  max_concurrency: number;
  jitter_ms_min: number;
  jitter_ms_max: number;
  quiet_hours: QuietHoursConfig | null;
};

export type IspResolution = {
  ispKey: string;
  mxHost: string;
  source: string;
};

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Request failed with ${res.status}`);
  }
  return res.json();
}

function nowUtc() {
  return new Date();
}

function startOfUtcHour(date = new Date()) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    0,
    0,
    0,
  ));
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
}

function getQuietHours(config: QuietHoursConfig | null | undefined): QuietHoursConfig | null {
  if (!config || typeof config !== "object") return null;
  return {
    start: typeof config.start === "string" ? config.start : undefined,
    end: typeof config.end === "string" ? config.end : undefined,
    tz: typeof config.tz === "string" ? config.tz : undefined,
  };
}

function formatTimeInZone(date: Date, tz?: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz || "UTC",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatter.format(date);
}

function withinQuietHours(now: Date, quiet: QuietHoursConfig | null | undefined): boolean {
  if (!quiet?.start || !quiet?.end) return false;
  const current = formatTimeInZone(now, quiet.tz);
  const start = quiet.start;
  const end = quiet.end;

  if (start === end) return true;

  if (start < end) {
    return current >= start && current <= end;
  }

  // window wraps midnight
  return current >= start || current <= end;
}

function nextQuietWindowExit(now: Date, quiet: QuietHoursConfig | null | undefined): Date | null {
  if (!quiet?.start || !quiet?.end) return null;
  const tz = quiet.tz || "UTC";
  const current = new Date(now.toLocaleString("en-US", { timeZone: tz }));

  const [endHour, endMinute] = quiet.end.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(endHour) || Number.isNaN(endMinute)) return null;

  const candidate = new Date(current);
  candidate.setHours(endHour, endMinute, 0, 0);

  if (quiet.start > quiet.end && current.getHours() * 60 + current.getMinutes() > endHour * 60 + endMinute) {
    // we are past end in wrap window; schedule for tomorrow
    candidate.setDate(candidate.getDate() + 1);
  } else if (quiet.start <= quiet.end && current > candidate) {
    candidate.setDate(candidate.getDate() + 1);
  }

  // convert back to UTC timestamp
  const offsetMs = current.getTime() - now.getTime();
  return new Date(candidate.getTime() - offsetMs);
}

export async function resolveIspForDomain(domain: string): Promise<IspResolution> {
  if (!domain) {
    return { ispKey: "other", mxHost: domain ?? "", source: "unknown" };
  }

  if (ISP_RESOLVE_URL) {
    try {
      const data = await fetchJson(ISP_RESOLVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      return {
        ispKey: data?.isp ?? "other",
        mxHost: data?.mx_host ?? domain,
        source: data?.source ?? "resolver",
      };
    } catch (error) {
      console.warn("ISP resolver fetch failed, falling back to mx_cache lookup", error);
    }
  }

  // fallback: try cache + registry directly via Supabase
  try {
    const { data: cache } = await supabaseAdmin
      .from("mx_cache")
      .select("isp_key, mx_host")
      .eq("domain", domain.toLowerCase())
      .maybeSingle();

    if (cache?.isp_key) {
      return {
        ispKey: cache.isp_key,
        mxHost: cache.mx_host ?? domain,
        source: "cache",
      };
    }

    const { data: registry } = await supabaseAdmin
      .from("isp_registry")
      .select("key, domain_patterns")
      .order("key", { ascending: true });

    const match = (registry ?? []).find((row: any) =>
      (row.domain_patterns ?? []).some((pattern: string) => domain.endsWith(pattern)),
    );

    return {
      ispKey: match?.key ?? "other",
      mxHost: domain,
      source: match ? "domain_pattern" : "fallback",
    };
  } catch (error) {
    console.error("resolveIspForDomain fallback error", error);
    return { ispKey: "other", mxHost: domain, source: "error" };
  }
}

export async function getIspCaps(accountId: string, ispKey: string): Promise<IspCaps | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("isp_caps")
      .select("*")
      .eq("account_id", accountId)
      .eq("isp_key", ispKey)
      .maybeSingle();

    if (error) {
      console.error("getIspCaps error", error);
      return null;
    }

    if (!data) return null;

    return {
      account_id: data.account_id,
      isp_key: data.isp_key,
      hourly_cap: data.hourly_cap,
      daily_cap: data.daily_cap,
      max_concurrency: data.max_concurrency,
      jitter_ms_min: data.jitter_ms_min,
      jitter_ms_max: data.jitter_ms_max,
      quiet_hours: getQuietHours(data.quiet_hours),
    };
  } catch (error) {
    console.error("getIspCaps exception", error);
    return null;
  }
}

export async function withIspSendLock<T>(
  accountId: string | null | undefined,
  ispKey: string | null | undefined,
  runner: () => Promise<T>,
): Promise<{ locked: boolean; result: T | null }> {
  if (!accountId || !ispKey) {
    const result = await runner();
    return { locked: true, result };
  }

  const caps = await getIspCaps(accountId, ispKey);
  if (!caps) {
    const result = await runner();
    return { locked: true, result };
  }

  const now = nowUtc();
  const nowIso = now.toISOString();

  await supabaseAdmin
    .from("send_locks")
    .delete()
    .eq("account_id", accountId)
    .eq("isp_key", ispKey)
    .lte("expires_at", nowIso);

  const { count } = await supabaseAdmin
    .from("send_locks")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("isp_key", ispKey)
    .gt("expires_at", nowIso);

  if ((count ?? 0) >= caps.max_concurrency) {
    return { locked: false, result: null };
  }

  const expiresAt = new Date(now.getTime() + 90_000).toISOString();

  const { error: lockError } = await supabaseAdmin
    .from("send_locks")
    .upsert(
      {
        account_id: accountId,
        isp_key: ispKey,
        locked_at: nowIso,
        expires_at: expiresAt,
      },
      { onConflict: "account_id,isp_key" },
    );

  if (lockError) {
    console.error("withIspSendLock upsert error", lockError);
    return { locked: false, result: null };
  }

  try {
    const result = await runner();
    await supabaseAdmin
      .from("send_locks")
      .delete()
      .eq("account_id", accountId)
      .eq("isp_key", ispKey);
    return { locked: true, result };
  } catch (error) {
    await supabaseAdmin
      .from("send_locks")
      .delete()
      .eq("account_id", accountId)
      .eq("isp_key", ispKey);
    throw error;
  }
}

export async function sendWithJitter<T>(
  accountId: string | null | undefined,
  ispKey: string | null | undefined,
  runner: () => Promise<T>,
): Promise<T> {
  const caps = accountId && ispKey ? await getIspCaps(accountId, ispKey) : null;
  const min = caps?.jitter_ms_min ?? 800;
  const max = caps?.jitter_ms_max ?? 2500;
  const jitter = Math.floor(min + Math.random() * Math.max(1, max - min + 1));
  await new Promise((resolve) => setTimeout(resolve, jitter));
  return runner();
}

export async function recordSendOutcome(params: {
  accountId: string | null | undefined;
  campaignId?: string | null;
  leadId?: string | null;
  threadId?: string | null;
  mailbox?: string | null;
  domain: string;
  ispKey?: string | null;
  outcome?: string;
  meta?: Record<string, unknown>;
}) {
  if (!params.accountId) return;
  try {
    await supabaseAdmin.from("send_outcomes").insert({
      account_id: params.accountId,
      campaign_id: params.campaignId ?? null,
      lead_id: params.leadId ?? null,
      thread_id: params.threadId ?? null,
      mailbox: params.mailbox ?? null,
      domain: params.domain,
      isp_key: params.ispKey ?? null,
      outcome: params.outcome ?? "sent",
      meta: params.meta ?? {},
    });
  } catch (error) {
    console.error("recordSendOutcome error", error);
  }
}

export interface MailboxConfig {
  id: string;
  email: string;
  domain: string;
  provider: 'ses' | 'mailgun' | 'mailersend';
  daily_cap: number;
  hourly_cap: number;
  warmup_enabled: boolean;
  warmup_start_date?: string;
  warmup_current_cap: number;
  warmup_increment: number;
  warmup_max_cap: number;
}

export interface DomainHourlyCounter {
  id: string;
  domain: string;
  user_id: string;
  hour_start: string;
  sent_count: number;
}

/**
 * Get mailbox configuration for a domain
 */
export async function getMailboxConfig(
  domain: string,
  userId: string
): Promise<MailboxConfig | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('mailboxes')
      .select('*')
      .eq('domain', domain)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error getting mailbox config:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getMailboxConfig:', error);
    return null;
  }
}

/**
 * Check if a domain is under hourly cap
 */
export async function isUnderHourlyCap(
  domain: string,
  userId: string,
  hourStart: Date
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('check_domain_hourly_cap', {
        p_domain: domain,
        p_user_id: userId,
        p_hour_start: hourStart.toISOString()
      });

    if (error) {
      console.error('Error checking hourly cap:', error);
      return false;
    }

    return data;
  } catch (error) {
    console.error('Error in isUnderHourlyCap:', error);
    return false;
  }
}

/**
 * Increment hourly counter for a domain
 */
export async function incrementHourlyCounter(
  domain: string,
  userId: string,
  hourStart: Date
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .rpc('increment_domain_hourly_counter', {
        p_domain: domain,
        p_user_id: userId,
        p_hour_start: hourStart.toISOString()
      });

    if (error) {
      console.error('Error incrementing hourly counter:', error);
    }
  } catch (error) {
    console.error('Error in incrementHourlyCounter:', error);
  }
}

/**
 * Get warmup-adjusted daily cap for a mailbox
 */
export async function getWarmupCap(mailboxId: string): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('get_mailbox_warmup_cap', {
        p_mailbox_id: mailboxId
      });

    if (error) {
      console.error('Error getting warmup cap:', error);
      return 50; // Default fallback
    }

    return data;
  } catch (error) {
    console.error('Error in getWarmupCap:', error);
    return 50; // Default fallback
  }
}

/**
 * Get current hour start (truncated to hour)
 */
export function getCurrentHourStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
}

/**
 * Get next hour start
 */
export function getNextHourStart(): Date {
  const currentHour = getCurrentHourStart();
  return new Date(currentHour.getTime() + 60 * 60 * 1000);
}

/**
 * Check if we can send from a domain considering all caps
 */
export async function canSendFromDomain(
  domain: string,
  userId: string,
  mailboxId?: string,
  accountId?: string | null,
): Promise<{
  allowed: boolean;
  reason?: string;
  nextAvailable?: Date;
  ispKey?: string | null;
  mxHost?: string | null;
  caps?: IspCaps | null;
}> {
  const domainLc = (domain ?? "").toLowerCase();
  let resolution: IspResolution = { ispKey: "other", mxHost: domainLc, source: "unknown" };
  let caps: IspCaps | null = null;

  try {
    resolution = await resolveIspForDomain(domainLc);
    const account = accountId ?? null;
    const now = nowUtc();

    let quietByAccount = false;
    if (account) {
      caps = await getIspCaps(account, resolution.ispKey);

      const { data: quietData, error: quietErr } = await supabaseAdmin.rpc("is_quiet_for_isp", {
        p_account_id: account,
        p_isp_key: resolution.ispKey,
      });

      if (quietErr) {
        console.warn("is_quiet_for_isp rpc failed", quietErr);
      }

      quietByAccount = quietData === true;

      if (quietByAccount) {
        return {
          allowed: false,
          reason: "account_quiet_hours",
          nextAvailable: getNextHourStart(),
          ispKey: resolution.ispKey,
          mxHost: resolution.mxHost,
          caps,
        };
      }

      if (caps) {
        if (withinQuietHours(now, caps.quiet_hours)) {
          return {
            allowed: false,
            reason: "isp_quiet_hours",
            nextAvailable: nextQuietWindowExit(now, caps.quiet_hours) ?? getNextHourStart(),
            ispKey: resolution.ispKey,
            mxHost: resolution.mxHost,
            caps,
          };
        }

        const hourStart = startOfUtcHour(now);
        const hourStartIso = hourStart.toISOString();

        const { count: hourlyCount } = await supabaseAdmin
          .from("send_outcomes")
          .select("id", { count: "exact", head: true })
          .eq("account_id", account)
          .eq("isp_key", resolution.ispKey)
          .gte("created_at", hourStartIso);

        if ((hourlyCount ?? 0) >= caps.hourly_cap) {
          const nextHour = new Date(hourStart.getTime() + 60 * 60 * 1000);
          return {
            allowed: false,
            reason: "isp_hourly_cap",
            nextAvailable: nextHour,
            ispKey: resolution.ispKey,
            mxHost: resolution.mxHost,
            caps,
          };
        }

        const dayStart = startOfUtcDay(now);
        const dayStartIso = dayStart.toISOString();
        const { count: dailyCount } = await supabaseAdmin
          .from("send_outcomes")
          .select("id", { count: "exact", head: true })
          .eq("account_id", account)
          .eq("isp_key", resolution.ispKey)
          .gte("created_at", dayStartIso);

        if ((dailyCount ?? 0) >= caps.daily_cap) {
          const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
          return {
            allowed: false,
            reason: "isp_daily_cap",
            nextAvailable: nextDay,
            ispKey: resolution.ispKey,
            mxHost: resolution.mxHost,
            caps,
          };
        }
      }
    }

    // Check hourly cap first
    const hourStart = getCurrentHourStart();
    const underHourlyCap = await isUnderHourlyCap(domain, userId, hourStart);
    
    if (!underHourlyCap) {
      const nextHour = getNextHourStart();
      return {
        allowed: false,
        reason: 'hourly_cap_exceeded',
        nextAvailable: nextHour,
        ispKey: resolution.ispKey,
        mxHost: resolution.mxHost,
        caps,
      };
    }

    // If we have a mailbox, check warmup cap
    if (mailboxId) {
      const warmupCap = await getWarmupCap(mailboxId);
      const mailbox = await getMailboxConfig(domain, userId);
      
      if (mailbox) {
        // Check daily cap (considering warmup)
        const { data: dailyCount } = await supabaseAdmin
          .from('domain_hourly_counters')
          .select('sent_count')
          .eq('domain', domain)
          .eq('user_id', userId)
          .gte('hour_start', new Date().toISOString().split('T')[0] + 'T00:00:00Z');

        const totalDailySent = dailyCount?.reduce((sum, row) => sum + row.sent_count, 0) || 0;
        
        if (totalDailySent >= warmupCap) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          
          return {
            allowed: false,
            reason: 'daily_cap_exceeded',
            nextAvailable: tomorrow,
            ispKey: resolution.ispKey,
            mxHost: resolution.mxHost,
            caps,
          };
        }
      }
    }

    return {
      allowed: true,
      ispKey: resolution.ispKey,
      mxHost: resolution.mxHost,
      caps,
    };
  } catch (error) {
    console.error('Error in canSendFromDomain:', error);
    return {
      allowed: false,
      reason: 'error',
      ispKey: resolution.ispKey,
      mxHost: resolution.mxHost,
      caps,
    };
  }
}

/**
 * Get domain sending statistics
 */
export async function getDomainStats(
  domain: string,
  userId: string,
  days: number = 7
): Promise<{
  totalSent: number;
  hourlyBreakdown: Array<{ hour: string; count: number }>;
  dailyBreakdown: Array<{ date: string; count: number }>;
}> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get hourly breakdown for today
    const today = new Date().toISOString().split('T')[0];
    const { data: hourlyData } = await supabaseAdmin
      .from('domain_hourly_counters')
      .select('hour_start, sent_count')
      .eq('domain', domain)
      .eq('user_id', userId)
      .gte('hour_start', today + 'T00:00:00Z')
      .order('hour_start');

    // Get daily breakdown
    const { data: dailyData } = await supabaseAdmin
      .from('domain_hourly_counters')
      .select('hour_start, sent_count')
      .eq('domain', domain)
      .eq('user_id', userId)
      .gte('hour_start', startDate.toISOString())
      .order('hour_start');

    // Process hourly data
    const hourlyBreakdown = hourlyData?.map(row => ({
      hour: new Date(row.hour_start).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        hour12: true 
      }),
      count: row.sent_count
    })) || [];

    // Process daily data
    const dailyMap = new Map<string, number>();
    dailyData?.forEach(row => {
      const date = row.hour_start.split('T')[0];
      dailyMap.set(date, (dailyMap.get(date) || 0) + row.sent_count);
    });

    const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, count]) => ({
      date: new Date(date).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      }),
      count
    }));

    const totalSent = dailyData?.reduce((sum, row) => sum + row.sent_count, 0) || 0;

    return {
      totalSent,
      hourlyBreakdown,
      dailyBreakdown
    };
  } catch (error) {
    console.error('Error in getDomainStats:', error);
    return {
      totalSent: 0,
      hourlyBreakdown: [],
      dailyBreakdown: []
    };
  }
}

/**
 * Create or update mailbox configuration
 */
export async function upsertMailbox(
  mailbox: Omit<MailboxConfig, 'id' | 'created_at' | 'updated_at'>
): Promise<MailboxConfig | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('mailboxes')
      .upsert({
        ...mailbox,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,email'
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting mailbox:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in upsertMailbox:', error);
    return null;
  }
}

/**
 * Delete mailbox configuration
 */
export async function deleteMailbox(mailboxId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('mailboxes')
      .delete()
      .eq('id', mailboxId);

    if (error) {
      console.error('Error deleting mailbox:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteMailbox:', error);
    return false;
  }
} 