import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

/**
 * Body:
 * {
 *   id: uuid (variant id),
 *   subject?: string,
 *   body?: string,
 *   delay_hours?: number,
 * }
 */
export async function POST(req: Request) {
  try {
    const { id, subject, body, delay_hours } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const sb = createClient(url, service, { auth: { persistSession: false } });

    const updateData: any = {};
    if (subject !== undefined) updateData.subject = subject;
    if (body !== undefined) updateData.body = body;
    if (delay_hours !== undefined) updateData.delay_hours = delay_hours;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await sb
      .from("campaign_step_variants")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Update variant failed" }, { status: 500 });
  }
}



