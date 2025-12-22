import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { extractVars } from "@/lib/template-vars";

type Contact = {
  email: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  meta?: any;
};

function lookup(obj: any, path: string) {
  return path.split(".").reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), obj);
}

function buildCtx(c: Contact) {
  return {
    email: c.email,
    name: c.name || [c.first_name, c.last_name].filter(Boolean).join(" "),
    first_name: c.first_name,
    last_name: c.last_name,
    company: c.company,
    title: c.title,
    meta: c.meta || {},
  };
}

export async function POST(req: Request) {
  try {
    const { template_id, subject, body, contact_emails } = await req.json();
    if ((!template_id && !(subject && body)) || !Array.isArray(contact_emails) || !contact_emails.length) {
      return NextResponse.json({ ok: false, error: "template_id or subject/body, and contact_emails required" }, { status: 400 });
    }

    const sb = supabaseService();

    // load template if id provided
    let subj = subject as string | undefined;
    let bdy = body as string | undefined;
    if (template_id) {
      const { data, error } = await sb
        .from("templates")
        .select("subject,body")
        .eq("id", template_id)
        .limit(1);
      if (error) throw error;
      subj = data?.[0]?.subject || subj;
      bdy  = data?.[0]?.body || bdy;
    }

    const vars = [...extractVars(subj || ""), ...extractVars(bdy || "")]
      // group by key+hasDefault to avoid duplicates
      .reduce((acc: any[], t) => {
        if (!acc.find((x) => x.key === t.key && x.hasDefault === t.hasDefault)) acc.push(t);
        return acc;
      }, []);

    // pull contacts
    const emails = contact_emails.map((e: string) => e.toLowerCase());
    const { data: contacts, error: cErr } = await sb
      .from("contacts")
      .select("email,name,first_name,last_name,company,title,meta")
      .in("email", emails);
    if (cErr) throw cErr;

    const missingByContact: Record<string, string[]> = {};
    const requiredVars = vars.filter((v) => !v.hasDefault);

    for (const email of emails) {
      const c = (contacts || []).find((x) => x.email.toLowerCase() === email) as Contact | undefined;
      const ctx = buildCtx(c || { email });
      const missing: string[] = [];
      for (const v of requiredVars) {
        const val = lookup(ctx, v.key);
        if (val == null || String(val).trim() === "") missing.push(v.key);
      }
      if (missing.length) missingByContact[email] = missing;
    }

    // aggregate
    const missingCounts: Record<string, number> = {};
    for (const miss of Object.values(missingByContact)) {
      for (const key of miss) missingCounts[key] = (missingCounts[key] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      vars,
      requiredVars: requiredVars.map((x) => x.key),
      missingByContact,
      missingCounts,
      totals: {
        contacts: emails.length,
        withIssues: Object.keys(missingByContact).length,
      },
    });
  } catch (e: any) {
    console.error("INSPECT_ERROR", e);
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}