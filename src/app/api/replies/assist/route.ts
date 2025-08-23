import { NextRequest, NextResponse } from "next/server";
import { detectObjections } from "@/lib/objection-detector";
import { craftReply, Tone } from "@/lib/playbooks";
import { supabaseAdmin } from "@/server/supabase";
import { applyStyle } from "@/lib/style-applier";
import { getSubscriptionStatus } from "@/lib/subscription";
import { authenticateExtension } from "@/lib/extension-auth";

export async function POST(req: NextRequest) {
  const { lastMessage, tone = "consultative", vars = {} } = await req.json();
  if (!lastMessage) return NextResponse.json({ suggestions: [] });

  // 1) Try normal cookie auth (user in browser)
  const { userId: cookieUser } = await getSubscriptionStatus();

  // 2) Else try extension token
  const tokenUser = await authenticateExtension(req);
  const userId = cookieUser || tokenUser;
  
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // fetch user + style
  const { data: userRow } = await supabaseAdmin
    .from("profiles").select("id, learn_from_sent").eq("id", userId).maybeSingle();
  const { data: styleRow } = await supabaseAdmin
    .from("user_styles").select("style").eq("user_id", userId).maybeSingle();

  const hits = detectObjections(String(lastMessage));
  const raw = hits.slice(0, 2).map(type => ({
    type,
    tone,
    text: craftReply(type as any, tone as Tone, {
      first_name: vars.first_name,
      company: vars.company,
      my_name: vars.my_name,
      calendly: vars.calendly || process.env.NEXT_PUBLIC_CALENDLY_URL || "",
    }),
  }));

  const suggestions = (userRow?.learn_from_sent && styleRow?.style)
    ? raw.map(s => ({ ...s, text: applyStyle(s.text, styleRow.style as any) }))
    : raw;

  return NextResponse.json({ suggestions });
} 