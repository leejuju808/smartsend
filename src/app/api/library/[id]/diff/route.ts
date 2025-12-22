import { NextRequest, NextResponse } from "next/server";
import { handleError, parseOrThrow, parseSearchParams, requireUser, HttpError } from "@/lib/api/auth";
import { diffQuerySchema, resourceParamSchema } from "@/lib/library/schemas";
import { jsonDiff } from "@/lib/library/diff";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = parseOrThrow(resourceParamSchema, context.params);
    const { from, to } = parseSearchParams(diffQuerySchema, req);
    const { supabase } = await requireUser();

    const [{ data: fromVersion, error: fromError }, { data: toVersion, error: toError }] = await Promise.all([
      supabase
        .from("shared_versions")
        .select("content")
        .eq("resource_id", id)
        .eq("version", from)
        .single(),
      supabase
        .from("shared_versions")
        .select("content")
        .eq("resource_id", id)
        .eq("version", to)
        .single(),
    ]);

    if (fromError || !fromVersion) {
      throw new HttpError(404, "version_not_found", { version: from });
    }

    if (toError || !toVersion) {
      throw new HttpError(404, "version_not_found", { version: to });
    }

    const diff = jsonDiff(fromVersion.content, toVersion.content);

    return NextResponse.json({ diff });
  } catch (error) {
    return handleError(error);
  }
}






