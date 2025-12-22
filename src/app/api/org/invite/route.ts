import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { org_id, email, role } = await req.json();
  
  const edgeUrl = process.env.SUPABASE_EDGE_URL || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
  const r = await fetch(`${edgeUrl}/team-invite`, {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 
      "Content-Type":"application/json" 
    },
    body: JSON.stringify({ org_id, email, role })
  }).then(r=>r.json());
  
  return NextResponse.json(r);
}

