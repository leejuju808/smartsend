import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const sb = supabaseService();
    const user_id = crypto.randomUUID(); // TODO: replace with auth

    const { data, error } = await sb
      .from("templates")
      .select("id,title,subject,body,created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, templates: data || [] });
  } catch (e: any) {
    console.error("FETCH_TEMPLATES_ERROR", e);
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}