import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { resend } from "@/lib/resend";

export async function POST(req: NextRequest) {
  const { domain, displayName } = await req.json();
  if (!domain) return NextResponse.json({ error: "Missing domain" }, { status: 400 });

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: { 
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {}
      } 
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // 1) Create domain in Resend (or idempotently fetch if exists)
    const rd = await resend("/domains", { 
      method: "POST", 
      body: JSON.stringify({ name: domain }) 
    });

    // 2) Save identity (pending)
    const from_email = `no-reply@${domain}`; // default; user can edit later
    const { data, error } = await supabase.from("sender_identities").insert({
      user_id: user.id,
      type: "domain",
      display_name: displayName || null,
      from_email,
      provider_id: rd.id,
      status: rd.status || "pending",
      dns: rd.records || [],
      is_default: true, // first one becomes default; trigger unsets others
    }).select().single();
    
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, sender: data });
  } catch (error) {
    console.error("Error creating domain:", error);
    return NextResponse.json({ error: "Failed to create domain" }, { status: 500 });
  }
}