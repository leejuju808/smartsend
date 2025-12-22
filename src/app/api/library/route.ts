import { NextRequest, NextResponse } from "next/server";
import { handleError, parseSearchParams, requireUser, HttpError } from "@/lib/api/auth";
import { libraryQuerySchema } from "@/lib/library/schemas";

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser();
    const { kind, limit: rawLimit } = parseSearchParams(libraryQuerySchema, req);
    const limit = rawLimit ?? 50;

    let query = supabase
      .from("shared_resources")
      .select("id, kind, name, description, status, current_version, updated_at, tags")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (kind) {
      query = query.eq("kind", kind);
    }

    const { data, error } = await query;
    if (error) {
      throw new HttpError(400, "failed_to_fetch_resources", { hint: error.message });
    }

    return NextResponse.json({ resources: data ?? [] });
  } catch (error) {
    return handleError(error);
  }
}






