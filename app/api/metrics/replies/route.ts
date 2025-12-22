import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") ?? 30);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("metrics_daily")
    .select("*")
    .gte("day", sinceIso)
    .order("day", { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const totals = (data ?? []).reduce(
    (acc, row) => ({
      sent: acc.sent + (row.sent ?? 0),
      replies: acc.replies + (row.replies ?? 0),
      ooo: acc.ooo + (row.ooo ?? 0),
      unsub: acc.unsub + (row.unsub ?? 0),
    }),
    { sent: 0, replies: 0, ooo: 0, unsub: 0 }
  );

  const replyRate = totals.sent ? totals.replies / totals.sent : 0;
  const oooRate = totals.sent ? totals.ooo / totals.sent : 0;
  const unsubRate = totals.sent ? totals.unsub / totals.sent : 0;

  return Response.json({
    series: data ?? [],
    totals,
    kpis: { replyRate, oooRate, unsubRate },
  });
}





