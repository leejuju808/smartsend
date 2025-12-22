export async function POST(req: Request) {
  const body = await req.json();

  const url = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return Response.json(
      { error: "Supabase function URL or anon key not configured" },
      { status: 500 }
    );
  }

  const r = await fetch(`${url}/train-dispatcher`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await r.json();
  return Response.json(data, { status: r.status });
}
















