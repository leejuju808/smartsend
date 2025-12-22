export async function POST(req: Request) {
  const { eval_set_id, model_version } = await req.json();

  if (!eval_set_id || !model_version) {
    return Response.json({ error: "missing args" }, { status: 400 });
  }

  const functionsUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!functionsUrl || !anonKey) {
    return Response.json({ error: "functions config missing" }, { status: 500 });
  }

  const response = await fetch(`${functionsUrl}/eval-runner`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ eval_set_id, model_version }),
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
















