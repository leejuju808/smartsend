import { NextRequest, NextResponse } from 'next/server';
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    // assumes RLS by user_id; expose via a secure view if needed
    const { data, error } = await sb
      .from("suppressions")
      .select("id, created_at, email, domain, source, note")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rows: data ?? [] }, { headers:{ "content-type":"application/json" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req:Request) {
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, domain, note } = await req.json();
    if (!email && !domain) {
      return NextResponse.json({ error: "email or domain required" }, { status: 400 });
    }

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    
    // Resolve current user via RLS; if you keep user_id on JWT, prefer an RPC that uses auth.uid()
    const userId = user.id;
    if (!userId) return NextResponse.json({ error: "auth required" }, { status: 401 });

    const { data, error } = await sb.rpc("upsert_suppression", {
      p_user: userId,
      p_email: email ?? null,
      p_domain: domain ?? null,
      p_source: "admin",
      p_note: note ?? null
    });
    
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data }, { headers:{ "content-type":"application/json" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req:Request) {
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id")!;
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    await sb.from("suppressions").delete().eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ ok:true }, { headers:{ "content-type":"application/json" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
