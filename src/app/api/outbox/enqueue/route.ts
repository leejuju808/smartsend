import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { extractLinks, injectPixel, makeShortCode } from "@/lib/tracking";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (k) => cookieStore.get(k)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { lead_id, to_email, to_name, subject, html, text, scheduled_at, campaign_id } = body;

  if (!to_email || !subject || (!html && !text)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Insert email into outbox first
  const { data: inserted, error: insErr } = await supabase.from("emails_outbox").insert({
    user_id: user.id, lead_id, to_email, to_name, subject, html, text,
    scheduled_at: scheduled_at ?? new Date().toISOString(), campaign_id
  }).select("*").single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Build base URL for tracking
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const pixelUrl = `${base}/t/${inserted.id}.gif`;

  // Rewrite links in HTML if present
  let finalHtml = inserted.html as string | null;
  if (finalHtml) {
    const links = extractLinks(finalHtml);
    for (const raw of links) {
      const { data: linkRow, error: linkErr } = await supabase
        .from("tracked_links")
        .insert({
          user_id: user.id,
          outbox_id: inserted.id,
          target_url: raw,
          short_code: makeShortCode(),
        })
        .select("short_code")
        .single();

      if (!linkErr && linkRow) {
        const short = `${base}/r/${linkRow.short_code}`;
        // naive replace all occurrences
        finalHtml = finalHtml!.split(raw).join(short);
      }
    }
    // Inject pixel
    finalHtml = injectPixel(finalHtml!, pixelUrl);
    // Update the outbox with modified HTML
    await supabase.from("emails_outbox").update({ html: finalHtml }).eq("id", inserted.id);
  }

  return NextResponse.json({ id: inserted.id });
}

