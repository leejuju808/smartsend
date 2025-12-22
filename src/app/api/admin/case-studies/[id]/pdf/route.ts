import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!(email && list.includes(email.toLowerCase()));
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function renderHtml(cs: any): string {
  const snapshot = cs.snapshot_json?.snapshot || {};
  const city = snapshot?.city ? String(snapshot.city) : "";
  const state = snapshot?.state ? String(snapshot.state) : "";
  const location = [city, state].filter(Boolean).join(", ") || "—";
  const size = snapshot?.company_size_range ? String(snapshot.company_size_range) : "—";
  const timeDays = Number(snapshot?.time_using_smartsend_days ?? 0);
  const timeUsing = Number.isFinite(timeDays) && timeDays > 0 ? `${timeDays} days` : "—";

  const problem = String(cs.snapshot_json?.problem || "—");
  const solution = asArray(cs.snapshot_json?.solution).map((s: any) => String(s?.label || "—"));
  const results = asArray(cs.snapshot_json?.results).map((r: any) => ({
    label: String(r?.label || "Result"),
    value: String(r?.value ?? "—"),
  }));

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(String(cs.title || "Case Study"))}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; color: #111827; }
    .title { font-size: 28px; font-weight: 800; margin-bottom: 18px; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #111827; margin: 0 0 10px; }
    ul { margin: 8px 0 0 18px; }
    li { margin: 4px 0; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .pill { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; background: #f8fafc; }
    .pill .k { font-size: 11px; color: #6b7280; }
    .pill .v { font-size: 14px; font-weight: 700; margin-top: 4px; }
    .quote { font-style: italic; background: #f8fafc; border-left: 4px solid #111827; padding: 12px 14px; }
    .footer { margin-top: 24px; font-size: 11px; color: #6b7280; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="title">${escapeHtml(String(cs.title || "Case Study"))}</div>
  <div class="meta">Generated: ${escapeHtml(cs.generated_at ? new Date(cs.generated_at).toLocaleString() : "—")} • Approval: ${
    cs.approved_for_use ? "approved" : "not approved"
  }</div>

  <div class="card">
    <h2>Snapshot</h2>
    <div class="grid">
      <div class="pill"><div class="k">City / State</div><div class="v">${escapeHtml(location)}</div></div>
      <div class="pill"><div class="k">Company size (range)</div><div class="v">${escapeHtml(size)}</div></div>
      <div class="pill"><div class="k">Time using SmartSend</div><div class="v">${escapeHtml(timeUsing)}</div></div>
    </div>
  </div>

  <div class="card">
    <h2>Problem</h2>
    <div>${escapeHtml(problem)}</div>
  </div>

  <div class="card">
    <h2>Solution</h2>
    <ul>
      ${solution.length ? solution.map((s) => `<li>${escapeHtml(s)}</li>`).join("") : "<li>—</li>"}
    </ul>
  </div>

  <div class="card">
    <h2>Results</h2>
    <ul>
      ${
        results.length
          ? results.map((r) => `<li><strong>${escapeHtml(r.label)}:</strong> ${escapeHtml(r.value)}</li>`).join("")
          : "<li>—</li>"
      }
    </ul>
  </div>

  <div class="card">
    <h2>Quote (System-Generated)</h2>
    <div class="quote">“SmartSend paid for itself after the first job.”<br/><span style="font-size: 12px; color: #6b7280;">(Anonymous, standardized.)</span></div>
  </div>

  <div class="footer">SmartSend Case Study Generator v1 • Anonymized • Read-only</div>
</body>
</html>
  `.trim();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sb = supabaseAdmin();
    const { data: cs, error } = await sb
      .from("case_studies")
      .select("id, title, generated_at, approved_for_use, snapshot_json, metrics_json")
      .eq("id", id)
      .single();

    if (error || !cs) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const html = renderHtml(cs);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="case-study-${id}.html"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}









