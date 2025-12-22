const FUNCTIONS_BASE = process.env.NEXT_PUBLIC_FUNCTIONS_BASE;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export async function POST(req: Request) {
  if (!FUNCTIONS_BASE) {
    return new Response("Functions base not configured", { status: 500 });
  }
  if (!SERVICE_KEY) {
    return new Response("Service role key not configured", { status: 500 });
  }

  const payload = await req.json().catch(() => ({}));

  const r = await fetch(`${FUNCTIONS_BASE}/calendar-hold`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await r.text();
  return new Response(body, { status: r.status, headers: { "Content-Type": "application/json" } });
}






