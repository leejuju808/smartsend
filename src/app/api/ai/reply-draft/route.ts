import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { thread_id, message_id, intent, variables } = await req.json();

    if (!thread_id || !intent) {
      return NextResponse.json(
        { error: "Missing thread_id or intent" },
        { status: 400 }
      );
    }

    // Load context
    const { data: thread } = await supabase
      .from("email_threads")
      .select("id, workspace_id, lead_email, subject, last_intent")
      .eq("id", thread_id)
      .single();

    if (!thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    const { data: msgs } = await supabase
      .from("email_messages")
      .select("direction, body_html, sent_at, from_address")
      .eq("thread_id", thread_id)
      .order("sent_at", { ascending: true })
      .limit(6);

    const { data: tmpl } = await supabase
      .from("reply_templates")
      .select("*")
      .eq("workspace_id", thread.workspace_id)
      .eq("intent", intent)
      .limit(1)
      .maybeSingle();

    // workspace settings: sender name/signature/booking link
    const { data: ws } = await supabase
      .from("workspace_settings")
      .select("sender_name, signature_html, booking_link, product_value_props")
      .eq("workspace_id", thread.workspace_id)
      .maybeSingle();

    // Fallback template if none exists
    const baseTemplate =
      tmpl?.body_template ??
      `Hi {{first_name}},

{{reply_core}}

Best,
{{signature}}`;

    // Build minimal plain-text context
    const history = (msgs ?? [])
      .map((m) => {
        const text = stripHtml(m.body_html || "");
        return `${m.direction === "sent" ? "You" : "Lead"} (${new Date(m.sent_at).toISOString()}): ${truncate(text, 600)}`;
      })
      .join("\n");

    const sys = `You draft concise, friendly cold-email replies. 

- Keep to 70-120 words unless intent is 'unsubscribe' (then < 30 words, confirm removal, no links).
- For 'meeting', propose 2 time windows in recipient's likely business hours unless times provided.
- Preserve brand tone: confident, helpful, no fluff.
- Insert at most one link (booking) and 1 bullet list max.`;

    const user = {
      intent,
      variables: variables || {},
      template: baseTemplate,
      product_value_props: ws?.product_value_props ?? [],
      history,
    };

    const r = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Return JSON with {subject, html}. 

Use the given template placeholders safely. 
If {{signature}} exists, embed provided signature HTML. 

Variables: ${JSON.stringify(user)}`,
          },
        ],
      }),
    });

    if (!r.ok) {
      const error = await r.text();
      console.error("OpenAI error:", error);
      return NextResponse.json(
        { error: "Failed to generate draft" },
        { status: 500 }
      );
    }

    const json = await r.json();
    const content = safeParse(json?.choices?.[0]?.message?.content) ?? {};
    const subject =
      content.subject ?? (thread?.subject ? `Re: ${thread.subject}` : "Re:");
    let html = content.html ?? "";
    
    // Replace placeholders
    const vars = variables || {};
    html = html.replaceAll("{{signature}}", ws?.signature_html || "");
    html = html.replaceAll("{{first_name}}", vars.first_name || "there");
    html = html.replaceAll("{{company}}", vars.company || "");
    html = html.replaceAll("{{link_book}}", vars.link_book || ws?.booking_link || "");

    return NextResponse.json({ subject, html });
  } catch (error: any) {
    console.error("Error generating reply draft:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function safeParse(s?: string) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

