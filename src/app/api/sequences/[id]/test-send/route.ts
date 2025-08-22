import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { sendStepEmail } from "@/jobs/sender";

function getUserId(req: Request) { return new URL(req.url).searchParams.get("userId"); }

// Replace with your real transport
async function transportSend(m: { to: string; subject: string; html: string; headers: Record<string,string> }) {
  // TODO: wire to your SMTP/Gmail sender here.
  // await sendEmail(m)
  console.log("Test send to", m.to, m.subject);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { step_no, to } = await req.json().catch(()=> ({}));
  if (!step_no || !to) return NextResponse.json({ error: "Missing step_no/to" }, { status: 400 });

  const [{ data: step }, { data: lead }, { data: user }] = await Promise.all([
    supabaseAdmin.from("sequence_steps").select("subject,body,delay_days").eq("sequence_id", params.id).eq("step_no", step_no).single(),
    // create/find a test lead record (idempotent by email)
    supabaseAdmin.from("leads").upsert({ owner: userId, email: to, name: "Test Recipient" }, { onConflict: "owner_email,email" })
      .select("id,email").eq("owner", userId).eq("email", to).single(),
    supabaseAdmin.auth.admin.getUserById(userId)
  ]);
  if (!step || !lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ownerEmail = user?.user?.email as string | undefined;
  if (!ownerEmail) return NextResponse.json({ error: "Owner email not found" }, { status: 400 });

  const res = await sendStepEmail({
    ownerId: userId,
    ownerEmail,
    lead: { id: lead.id, email: lead.email },
    sequenceId: params.id,
    stepNo: Number(step_no),
    subject: step.subject,
    bodyHtml: step.body,
    transportSend
  });

  return NextResponse.json({ ok: true, result: res });
}

