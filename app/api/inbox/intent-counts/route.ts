import { NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";

const INTENTS = [
  "positive",
  "neutral",
  "question",
  "negative",
  "unsubscribe",
  "out_of_office",
  "unknown",
] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const selected = (url.searchParams.get("intent") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const supabase = await createServerClient();

  const counts: Record<string, number> = {};

  await Promise.all(
    INTENTS.map(async (intent) => {
      let query = supabase
        .from("v_inbox_threads")
        .select("id", { head: true, count: "exact" })
        .eq("ai_intent_safe", intent);

      if (selected.length) {
        query = query.in("ai_intent_safe", selected);
      }

      const { count } = await query;
      counts[intent] = count ?? 0;
    }),
  );

  return NextResponse.json({ counts });
}





