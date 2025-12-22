import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function createClientFromCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
}

export async function GET(_req: NextRequest, { params }: { params: { campaignId: string } }) {
  const cookieStore = await cookies();
  const supabase = createClientFromCookies(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("campaign_template_variants")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ variants: data });
}

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const cookieStore = await cookies();
  const supabase = createClientFromCookies(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, subject_template, body_template, weight = 50, is_active = true } = body || {};

  const { error } = await supabase.from("campaign_template_variants").insert({
    campaign_id: params.campaignId,
    name,
    subject_template,
    body_template,
    weight,
    is_active,
    created_by: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}


