import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/server/supabase";

function getUserId(req: Request){ return new URL(req.url).searchParams.get("userId"); }

export async function GET(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error:"Unauthorized" }, { status:401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(200, Number(url.searchParams.get("limit") || 25));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const order = (url.searchParams.get("order") || "created_at.desc");

  let query = supabaseAdmin.from("leads")
    .select("id,email,name,company,tz,unsubscribed,created_at", { count: "exact" })
    .eq("owner", userId);

  if (q) {
    query = query.or([
      `email.ilike.%${q}%`,
      `name.ilike.%${q}%`,
      `company.ilike.%${q}%`
    ].join(","));
  }

  // order parsing: field.direction
  const [field, dir] = order.split(".");
  query = query.order(field as any, { ascending: (dir === "asc") }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });

  return NextResponse.json({ items: data ?? [], total: count ?? 0 });
}
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/server/supabase";

function getUserId(req: Request){ return new URL(req.url).searchParams.get("userId"); }

export async function GET(req: Request) {
  const userId = getUserId(req);
  const limit = Number(new URL(req.url).searchParams.get("limit") || "20");
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("id,email,name")
    .eq("owner", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, limit)));
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

