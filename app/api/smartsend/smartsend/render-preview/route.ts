import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { renderTpl } from "@/lib/template";

export async function POST(req: Request) {
  try {
    const { contact_email, subject, body } = await req.json();
    if (!contact_email) return NextResponse.json({ ok:false, error:"contact_email required" }, { status: 400 });

    const sb = supabaseService();
    const { data: contacts, error } = await sb
      .from("contacts")
      .select("email,name,first_name,last_name,company,title,meta")
      .eq("email", contact_email)
      .limit(1);
    if (error) throw error;

    const c = contacts?.[0] || { email: contact_email, name: "", first_name: "", last_name: "", company: "", title: "", meta: {} };

    const ctx = {
      email: c.email,
      name: c.name || [c.first_name, c.last_name].filter(Boolean).join(" "),
      first_name: c.first_name,
      last_name: c.last_name,
      company: c.company,
      title: c.title,
      meta: c.meta || {},
    };

    const out = {
      subject: renderTpl(subject || "", ctx),
      body_html: `<div style="font-family:ui-sans-serif,system-ui">${renderTpl(body || "", ctx)}</div>`
    };

    return NextResponse.json({ ok:true, preview: out });
  } catch (e:any) {
    console.error("RENDER_PREVIEW_ERROR", e);
    return NextResponse.json({ ok:false, error:String(e.message||e) }, { status: 500 });
  }
}