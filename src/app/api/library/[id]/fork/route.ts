import { NextRequest, NextResponse } from "next/server";
import { handleError, parseOrThrow, requireUser, HttpError } from "@/lib/api/auth";
import { forkResourceSchema, resourceParamSchema } from "@/lib/library/schemas";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id } = parseOrThrow(resourceParamSchema, context.params);
    const payload = parseOrThrow(forkResourceSchema, await req.json());
    const { supabase } = await requireUser();

    const { data, error } = await supabase.rpc("shared_fork", {
      p_source: id,
      p_name: payload.name,
      p_description: payload.description ?? null,
    });

    if (error) {
      throw new HttpError(400, "fork_failed", { hint: error.message });
    }

    return NextResponse.json({ resourceId: data });
  } catch (error) {
    return handleError(error);
  }
}






