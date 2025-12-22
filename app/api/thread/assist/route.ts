import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const response = await fetch(`${process.env.NEXT_PUBLIC_FUNCTIONS_BASE}/thread-assist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify(body)
  });

  return new Response(await response.text(), { status: response.status });
}






