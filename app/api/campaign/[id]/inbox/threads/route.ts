import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type Tab = "all" | "needs" | "replied";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const url = new URL(req.url);
  const tab = ((url.searchParams.get("tab") ?? "all") as Tab) ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? "25")));
  const offset = (page - 1) * pageSize;

  let base = supabase
    .from("inbox_threads")
    .select("id, lead_id, campaign_id, needs_reply, updated_at", { count: "exact" })
    .eq("campaign_id", params.id);

  if (tab === "needs") {
    base = base.eq("needs_reply", true);
  } else if (tab === "replied") {
    base = base.eq("needs_reply", false);
  }

  if (q) {
    const { data: hits, error: searchError } = await supabase
      .from("v_thread_preview")
      .select("thread_id, last_subject, last_preview")
      .eq("campaign_id", params.id);

    if (searchError) {
      return NextResponse.json({ error: searchError.message }, { status: 500 });
    }

    const lower = q.toLowerCase();
    const ids =
      hits
        ?.filter((h) => {
          const subject = (h.last_subject ?? "").toLowerCase();
          const preview = (h.last_preview ?? "").toLowerCase();
          return subject.includes(lower) || preview.includes(lower);
        })
        .map((h) => h.thread_id) ?? [];

    if (ids.length === 0) {
      return NextResponse.json({
        items: [],
        count: 0,
        page,
        pageSize,
        leads: {},
        previews: {},
      });
    }

    base = base.in("id", ids);
  }

  const { data, error, count } = await base.order("updated_at", { ascending: false }).range(offset, offset + pageSize - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tids = (data ?? []).map((row) => row.id);
  const leadIds = (data ?? []).map((row) => row.lead_id).filter(Boolean);

  const [previews, leads, threads] = await Promise.all([
    tids.length
      ? supabase
          .from("v_thread_preview")
          .select("thread_id, last_preview, last_subject, last_at, last_dir, last_label")
          .in("thread_id", tids)
      : Promise.resolve({ data: [] as any[], error: null }),
    leadIds.length
      ? supabase.from("leads").select("id, first_name, last_name, email, company").in("id", leadIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    // Block 9700: Fetch intent from smartsend_threads
    leadIds.length
      ? supabase
          .from("smartsend_threads")
          .select("lead_id, intent")
          .eq("campaign_id", params.id)
          .in("lead_id", leadIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (previews.error) {
    return NextResponse.json({ error: previews.error.message }, { status: 500 });
  }
  if (leads.error) {
    return NextResponse.json({ error: leads.error.message }, { status: 500 });
  }

  const leadMap: Record<string, any> = {};
  (leads.data ?? []).forEach((lead) => {
    leadMap[lead.id] = lead;
  });

  const previewMap: Record<string, any> = {};
  (previews.data ?? []).forEach((preview) => {
    previewMap[preview.thread_id] = preview;
  });

  // Block 9700: Map intent by lead_id
  const intentMap: Record<string, string> = {};
  (threads.data ?? []).forEach((thread: any) => {
    if (thread.lead_id && thread.intent) {
      intentMap[thread.lead_id] = thread.intent;
    }
  });

  // Add intent to items
  const itemsWithIntent = (data ?? []).map((item) => ({
    ...item,
    intent: intentMap[item.lead_id] || null,
  }));

  return NextResponse.json({
    items: itemsWithIntent,
    count: count ?? 0,
    page,
    pageSize,
    leads: leadMap,
    previews: previewMap,
  });
}



