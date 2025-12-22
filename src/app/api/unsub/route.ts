import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUnsub } from "@/lib/suppress/token";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role to insert regardless of RLS
);

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) return new NextResponse("Missing token", { status: 400 });

  const payload = verifyUnsub(token);
  if (!payload) return new NextResponse("Invalid token", { status: 400 });

  const { u: user_id, e: email, c: campaign_id } = payload;

  // Upsert global suppression
  const { error: supErr } = await supabase.from("suppressions").upsert(
    { user_id, email, reason: "unsubscribe", source: "link" },
    { onConflict: "user_id,email" }
  );
  if (supErr) console.error("suppressions upsert error", supErr);

  // Optional: also suppress this campaign specifically
  if (campaign_id) {
    await supabase.from("campaign_suppressions").upsert(
      { user_id, campaign_id, email, reason: "unsubscribe" },
      { onConflict: "campaign_id,email" }
    );
  }

  // Escape email for HTML
  const safeEmail = email.replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;");

  const html = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Unsubscribed</title>
      <style>
        body {
          font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
          background: #0a0a0a;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background: #111;
          border: 1px solid #222;
          border-radius: 16px;
          padding: 28px;
          max-width: 520px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0,0,0,.35);
        }
        .bolt {
          font-size: 42px;
          color: #ffd700;
          margin-bottom: 8px;
        }
        .btn {
          display: inline-block;
          margin-top: 16px;
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid #333;
          color: #ccc;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="bolt">⚡</div>
        <h1 style="margin:10px 0 6px">You're unsubscribed</h1>
        <p style="opacity:.8">We won't email <b>${safeEmail}</b> again from this sender.</p>
        <p style="opacity:.6;font-size:13px">If this was a mistake, you can reply to the last email to re-subscribe.</p>
        <a class="btn" href="https://smartsend.ai">Back to site</a>
      </div>
    </body>
  </html>`;
  
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
