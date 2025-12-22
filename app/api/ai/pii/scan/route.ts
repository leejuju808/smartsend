const FUNCTIONS_URL = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export async function POST(req: Request) {
  if (!FUNCTIONS_URL || !SUPABASE_ANON_KEY) {
    return Response.json(
      { error: "Supabase configuration missing" },
      { status: 500 },
    );
  }

  const payload = await req.json();

  const r = await fetch(`${FUNCTIONS_URL}/pii-scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  return Response.json(data, { status: r.status });
}
















