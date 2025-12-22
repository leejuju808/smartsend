import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleError, parseOrThrow, requireUser, HttpError } from "@/lib/api/auth";
import { resourceParamSchema } from "@/lib/library/schemas";

const permissionBodySchema = z.object({
  subject_type: z.enum(["user", "campaign", "role"]),
  subject_id: z.string().uuid().nullable().optional(),
  level: z.enum(["view", "use", "edit", "admin"]),
});

const patchBodySchema = z.object({
  perm_id: z.string().uuid(),
  level: z.enum(["view", "use", "edit", "admin"]),
});

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_: NextRequest, context: RouteContext) {
  try {
    const { id } = parseOrThrow(resourceParamSchema, context.params);
    const { supabase } = await requireUser();

    const { data, error } = await supabase
      .from("shared_permissions")
      .select("id, subject_type, subject_id, level")
      .eq("resource_id", id)
      .order("subject_type", { ascending: true })
      .order("subject_id", { ascending: true });

    if (error) {
      throw new HttpError(400, "failed_to_fetch_permissions", { hint: error.message });
    }

    return NextResponse.json({ permissions: data ?? [] });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id } = parseOrThrow(resourceParamSchema, context.params);
    const payload = parseOrThrow(permissionBodySchema, await req.json());
    const { supabase } = await requireUser();

    const { data, error } = await supabase
      .from("shared_permissions")
      .insert({
        resource_id: id,
        subject_type: payload.subject_type,
        subject_id: payload.subject_id ?? null,
        level: payload.level,
      })
      .select("id")
      .single();

    if (error) {
      throw new HttpError(400, "failed_to_create_permission", { hint: error.message });
    }

    return NextResponse.json({ id: data?.id });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id } = parseOrThrow(resourceParamSchema, context.params);
    const payload = parseOrThrow(patchBodySchema, await req.json());
    const { supabase } = await requireUser();

    const { error } = await supabase
      .from("shared_permissions")
      .update({ level: payload.level })
      .eq("id", payload.perm_id)
      .eq("resource_id", id);

    if (error) {
      throw new HttpError(400, "failed_to_update_permission", { hint: error.message });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}







