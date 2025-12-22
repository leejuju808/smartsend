import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "all"; // all|queued|sent|failed
    const q = (url.searchParams.get("q") || "").trim(); // search by email/subject
    const limit = Math.min(Number(url.searchParams.get("limit") || 25), 100);
    const cursor = url.searchParams.get("cursor");

    const sb = supabaseService();
    let query = sb
      .from("sequence_jobs")
      .select("*, sequence_steps_new(template_subject)")
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (status !== "all") query = query.eq("status", status);
    if (q) {
      query = query.or(
        `contact_email.ilike.%${q}%,sequence_steps_new.template_subject.ilike.%${q}%`
      );
    }
    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;
    if (error) throw error;

    const hasMore = data.length > limit;
    const rows = hasMore ? data.slice(0, limit) : data;
    const nextCursor = hasMore ? rows[rows.length - 1].created_at : null;

    return NextResponse.json({ ok: true, rows, nextCursor });
  } catch (e: any) {
    console.error("JOBS_GET_ERROR", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, action } = await req.json();
    if (!id || !["retry", "cancel"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }
    const sb = supabaseService();

    if (action === "retry") {
      // requeue to run in ~30s
      const runAt = new Date(Date.now() + 30 * 1000).toISOString();
      const { error } = await sb
        .from("sequence_jobs")
        .update({ status: "queued", run_at: runAt, last_error: null })
        .eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await sb
        .from("sequence_jobs")
        .update({ status: "canceled" })
        .eq("id", id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("JOBS_PATCH_ERROR", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}