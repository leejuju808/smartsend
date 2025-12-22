import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleError, parseOrThrow, requireUser, HttpError } from "@/lib/api/auth";
import { resourceParamSchema } from "@/lib/library/schemas";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = parseOrThrow(resourceParamSchema, context.params);
    const { supabase } = await requireUser();

    const { data, error } = await supabase
      .from("shared_versions")
      .select("version, created_at, changelog")
      .eq("resource_id", id)
      .order("version", { ascending: false });

    if (error) {
      throw new HttpError(400, "failed_to_fetch_versions", { hint: error.message });
    }

    return NextResponse.json({ versions: data ?? [] });
  } catch (error) {
    return handleError(error);
  }
}






