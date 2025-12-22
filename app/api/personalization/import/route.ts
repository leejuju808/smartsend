import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import Papa from "papaparse";

type RawSnippet = {
  body?: string;
  industry?: string | null;
  role_hint?: string | null;
  tech_stack?: string[] | string | null;
  region?: string | null;
  is_active?: boolean;
};

function normalizeSnippet(raw: RawSnippet): {
  body: string;
  industry: string | null;
  role_hint: string | null;
  tech_stack: string[] | null;
  region: string | null;
  is_active?: boolean;
} {
  const body = typeof raw?.body === "string" ? raw.body.trim() : "";
  if (!body) {
    throw new Error("Each snippet must include a non-empty body.");
  }
  const industry =
    typeof raw.industry === "string" && raw.industry.trim().length > 0
      ? raw.industry.trim()
      : null;
  const roleHint =
    typeof raw.role_hint === "string" && raw.role_hint.trim().length > 0
      ? raw.role_hint.trim()
      : null;
  const region =
    typeof raw.region === "string" && raw.region.trim().length > 0
      ? raw.region.trim()
      : null;

  let techStack: string[] | null = null;
  if (Array.isArray(raw.tech_stack)) {
    techStack = raw.tech_stack.map((item) => String(item).trim()).filter(Boolean);
  } else if (typeof raw.tech_stack === "string") {
    techStack = raw.tech_stack
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return {
    body,
    industry,
    role_hint: roleHint,
    tech_stack: techStack && techStack.length > 0 ? techStack : null,
    region,
    is_active: typeof raw.is_active === "boolean" ? raw.is_active : undefined
  };
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const format = (payload?.format ?? "json") as "json" | "csv";
  const text = payload?.text;
  let snippets: RawSnippet[] = [];

  try {
    if (Array.isArray(payload?.snippets)) {
      snippets = payload.snippets as RawSnippet[];
    } else if (typeof text === "string") {
      if (format === "json") {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          snippets = parsed as RawSnippet[];
        } else if (Array.isArray(parsed?.snippets)) {
          snippets = parsed.snippets as RawSnippet[];
        } else {
          throw new Error("JSON payload must be an array or { snippets: [...] }");
        }
      } else if (format === "csv") {
        const parsed = Papa.parse<RawSnippet>(text, {
          header: true,
          skipEmptyLines: true
        });
        if (parsed.errors.length) {
          throw new Error(parsed.errors[0]?.message || "Failed to parse CSV");
        }
        snippets = parsed.data;
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }
    } else {
      throw new Error("Missing snippets or text payload");
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to parse snippets" }, { status: 400 });
  }

  if (!snippets.length) {
    return NextResponse.json({ error: "No snippets provided" }, { status: 400 });
  }

  let normalized: ReturnType<typeof normalizeSnippet>[];
  try {
    normalized = snippets.map(normalizeSnippet);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Invalid snippet data" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase configuration missing" }, { status: 500 });
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/snippets-upsert`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify({
      owner_id: user.id,
      snippets: normalized
    })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result?.error ?? "Failed to import snippets";
    return NextResponse.json({ error: message }, { status: response.status || 500 });
  }

  return NextResponse.json({
    ok: true,
    count: result?.count ?? normalized.length
  });
}

















