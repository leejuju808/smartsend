import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { atFriendlyHour, bumpOutOfQuiet, getProfilePolicy } from "@/server/scheduler";
import { isIana, guessTzFromEmail } from "@/lib/tz";

/** Replace with your real auth */
function getUserId(req: Request){ return new URL(req.url).searchParams.get("userId"); }

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const { leadIds, startNow } = await req.json().catch(()=> ({}));
  if (!Array.isArray(leadIds) || leadIds.length === 0) return NextResponse.json({ error:"leadIds[]" }, { status:400 });

  // ownership checks
  const { data: seq } = await supabaseAdmin.from("sequences")
    .select("id, owner, status").eq("id", params.id).single();
  if (!seq || seq.owner !== userId) return NextResponse.json({ error:"Not found" }, { status:404 });

  const policy = await getProfilePolicy(userId);
  const { data: leadRows } = await supabaseAdmin
    .from("leads").select("id,email,tz").in("id", leadIds);

  const now = new Date();
  const rows = (leadRows || []).map(l => {
    let leadTz = isIana((l as any).tz) ? (l as any).tz! : (guessTzFromEmail((l as any).email) || policy.tz);
    let when = startNow ? bumpOutOfQuiet(new Date(), policy.tz, policy.quietStart, policy.quietEnd)
                        : atFriendlyHour(new Date(), leadTz, 10);
    when = bumpOutOfQuiet(when, policy.tz, policy.quietStart, policy.quietEnd);
    return {
      owner: userId, sequence_id: params.id, lead_id: (l as any).id,
      step_no: 1, status: "active", next_send_at: when.toISOString()
    };
  });

  const { error } = await supabaseAdmin.from("enrollments").upsert(rows, { onConflict: "owner,sequence_id,lead_id" });
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ ok: true, scheduled_for: firstSend.toISOString(), count: rows.length });
}

