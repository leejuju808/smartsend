import { NextResponse } from "next/server";

type TriggerResult = {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: unknown;
};

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "env_not_configured" }, { status: 500 });
  }

  const [gmail, outlook] = await Promise.all([
    triggerFunction(supabaseUrl, serviceKey, "gmail-poller"),
    triggerFunction(supabaseUrl, serviceKey, "outlook-poller"),
  ]);

  const status = gmail.ok && outlook.ok ? 200 : 500;

  return NextResponse.json(
    {
      gmail,
      outlook,
    },
    { status },
  );
}

async function triggerFunction(url: string, key: string, fn: string): Promise<TriggerResult> {
  try {
    const res = await fetch(`${url}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: "{}",
    });

    const data = await safeJson(res);
    return res.ok
      ? { ok: true, status: res.status, data }
      : { ok: false, status: res.status, error: data };
  } catch (error) {
    return { ok: false, status: 500, error: (error as Error).message };
  }
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch (_error) {
    return null;
  }
}

