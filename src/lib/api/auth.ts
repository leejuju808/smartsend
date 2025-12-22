import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { userClient } from "@/lib/supabase/userClient";

export class HttpError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export async function requireUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = userClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new HttpError(401, "unauthorized");
  }

  return { supabase, user };
}

export function handleError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  }

  console.error("[api] unexpected error", error);
  return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
}

export function parseOrThrow<T>(schema: { parse: (input: unknown) => T }, payload: unknown): T {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, "invalid_payload", { issues: error.flatten() });
    }
    throw error;
  }
}

export function parseSearchParams<T>(
  schema: { parse: (input: unknown) => T },
  req: NextRequest,
): T {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return parseOrThrow(schema, params);
}

