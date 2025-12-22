import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || 1);
  const limit = Math.min(100, Number(url.searchParams.get("limit") || 25));
  const q = (url.searchParams.get("query") || "").trim();
  const domain = (url.searchParams.get("domain") || "").trim();
  const hasEmail = url.searchParams.get("has_email");
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("leads")
    .select("id, first_name, last_name, email, company, phone, domain, created_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Filters
  if (q) {
    // rough OR search
    query = query.or(
      ["first_name.ilike.%"+q+"%", "last_name.ilike.%"+q+"%", "email.ilike.%"+q+"%", "company.ilike.%"+q+"%", "domain.ilike.%"+q+"%"].join(",")
    );
  }
  if (domain) query = query.eq("domain", domain);
  if (hasEmail === "true") query = query.not("email", "is", null);

  const { data, error, count } = await query.range(from, to);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    page, limit, total: count ?? 0, rows: data ?? []
  });
}
