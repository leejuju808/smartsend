import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type MailAccountRow = {
  id: string;
  email: string | null;
  provider: string | null;
};

type SendLimitRow = {
  account_id: string;
  daily_cap: number | null;
  hourly_cap: number | null;
  warmup_enabled: boolean | null;
  warmup_day: number | null;
  timezone: string | null;
};

export async function GET() {
  const { data: accounts, error } = await supabase
    .from("mail_accounts")
    .select("id, email, provider")
    .returns<MailAccountRow[]>()
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const accountIds = (accounts ?? []).map((account) => account.id);

  const limitsMap = new Map<
    string,
    {
      daily_cap: number;
      hourly_cap: number;
      warmup_enabled: boolean;
      warmup_day: number;
      timezone: string;
    }
  >();

  if (accountIds.length > 0) {
    const { data: limits } = await supabase
      .from("send_limits")
      .select("account_id, daily_cap, hourly_cap, warmup_enabled, warmup_day, timezone")
      .in("account_id", accountIds)
      .returns<SendLimitRow[]>();

    for (const limit of limits ?? []) {
      limitsMap.set(limit.account_id, {
        daily_cap: Number(limit.daily_cap ?? 150),
        hourly_cap: Number(limit.hourly_cap ?? 30),
        warmup_enabled: Boolean(limit.warmup_enabled ?? true),
        warmup_day: Number(limit.warmup_day ?? 1),
        timezone: limit.timezone ?? "America/Los_Angeles",
      });
    }
  }

  const rows = [];

  for (const account of accounts ?? []) {
    const accountId = account.id;

    const [{ data: capsData }, { data: leftData }] = await Promise.all([
      supabase.rpc("effective_caps", { p_account: accountId }),
      supabase.rpc("sends_left", { p_account: accountId }),
    ]);

    const caps = capsData?.[0];
    const left = leftData?.[0];
    const configured = limitsMap.get(accountId);

    rows.push({
      account_id: accountId,
      email: account.email ?? "",
      provider: account.provider ?? "gmail",
      cap_24h: configured?.daily_cap ?? 150,
      cap_1h: configured?.hourly_cap ?? 30,
      effective_cap_24h: caps?.daily_cap ?? configured?.daily_cap ?? 150,
      effective_cap_1h: caps?.hourly_cap ?? configured?.hourly_cap ?? 30,
      left_24h: left?.left_24h ?? 0,
      left_1h: left?.left_1h ?? 0,
      warmup_enabled: configured?.warmup_enabled ?? true,
      warmup_day: configured?.warmup_day ?? 1,
      timezone: configured?.timezone ?? "America/Los_Angeles",
    });
  }

  return NextResponse.json({ accounts: rows });
}


