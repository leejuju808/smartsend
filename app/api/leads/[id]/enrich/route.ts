import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !lead) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Call the edge function for enrichment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return new NextResponse("Server configuration error", { status: 500 });
  }

  const edgeUrl = `${supabaseUrl}/functions/v1/lead-enrichment`;

  try {
    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ lead }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(`Enrichment failed: ${errorText}`, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return new NextResponse(`Enrichment error: ${err.message}`, { status: 500 });
  }
}

