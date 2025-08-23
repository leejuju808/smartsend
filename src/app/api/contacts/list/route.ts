export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] });

  const { data, error } = await supabase
    .from("contacts")
    .select("id,first_name,last_name,email,company,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return NextResponse.json({ items: [], error: String(error) }, { status: 500 });
  
  // Transform data to include a computed name field for backward compatibility
  const transformedData = (data || []).map(contact => ({
    ...contact,
    name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null
  }));
  
  return NextResponse.json({ items: transformedData });
}

