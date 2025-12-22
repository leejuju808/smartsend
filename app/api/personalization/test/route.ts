import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import OpenAI from "openai";

const openAiKey = process.env.OPENAI_API_KEY;

if (!openAiKey) {
  throw new Error("OPENAI_API_KEY not configured for personalization test route");
}

const openai = new OpenAI({ apiKey: openAiKey });

type TestPayload = {
  company?: string | null;
  first_name?: string | null;
  role?: string | null;
  industry?: string | null;
  region?: string | null;
  tech_stack?: string[] | string | null;
  summary?: string | null;
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: TestPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const techStack =
    Array.isArray(payload.tech_stack)
      ? payload.tech_stack
      : typeof payload.tech_stack === "string"
        ? payload.tech_stack
            .split(/[,;]+/)
            .map((item) => item.trim())
            .filter(Boolean)
        : null;

  const queryPieces = [
    payload.company ? `Company: ${payload.company}` : null,
    payload.first_name ? `Contact: ${payload.first_name}` : null,
    payload.role ? `Role: ${payload.role}` : null,
    payload.industry ? `Industry: ${payload.industry}` : null,
    payload.region ? `Region: ${payload.region}` : null,
    techStack && techStack.length ? `Tech: ${techStack.join(", ")}` : null,
    payload.summary ?? null
  ].filter(Boolean) as string[];

  const queryText = queryPieces.length ? queryPieces.join("\n") : payload.company ?? "generic personalization";

  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: queryText.slice(0, 8000)
  });

  const embedding = embeddingResponse.data[0]?.embedding;
  if (!embedding) {
    return NextResponse.json({ error: "Failed to generate embedding" }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("pick_personalization", {
    owner: user.id,
    industry_in: payload.industry ?? null,
    role_in: payload.role ?? null,
    techs_in: techStack && techStack.length ? techStack : null,
    region_in: payload.region ?? null,
    query_vec: embedding,
    c: 0.6
  }).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    snippet: data ?? null
  });
}

















