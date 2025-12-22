import { NextResponse } from "next/server";
import { sustainedErrorHint } from "@/lib/data/queue";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { writeAudit } from "@/lib/data/audit";

async function sb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const hint = await sustainedErrorHint(params.id);
    return NextResponse.json(hint, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const campaignId = params.id;
    const hint = await sustainedErrorHint(campaignId, { windowMin: 10, threshold: 0.3 });

    // Only auto-pause if enabled and there's a spike
    const supabase = await sb();
    const { data: camp } = await supabase
      .from("campaigns")
      .select("pause_on_spike, is_paused")
      .eq("id", campaignId)
      .maybeSingle();

    if (hint.showHint && camp?.pause_on_spike && !camp?.is_paused) {
      await supabase
        .from("campaigns")
        .update({ is_paused: true, pause_reason: "spike_autopause" })
        .eq("id", campaignId);

      await writeAudit(campaignId, "campaign_paused", {
        reason: "spike_autopause",
        errorRate: hint.errorRate,
        windowMin: hint.windowMin,
      });

      return NextResponse.json({ ok: true, paused: true }, { headers: { "Content-Type": "application/json" } });
    }

    return NextResponse.json({ ok: true, paused: false }, { headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

