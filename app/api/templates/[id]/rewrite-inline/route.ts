import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { command, selectedText, fullText } = body;

  if (!command) {
    return NextResponse.json({ error: "Command is required" }, { status: 400 });
  }

  // Map slash commands to rewrite API parameters
  const commandMap: Record<string, { tone?: string; length?: string }> = {
    'rewrite-shorter': { length: 'shorter' },
    'expand': { length: 'longer' },
    'make-friendlier': { tone: 'friendly' },
    'make-direct': { tone: 'direct' },
    'fix-grammar': { tone: 'neutral' },
    'add-cta': { tone: 'neutral' },
    'add-opener': { tone: 'neutral' },
  };

  const config = commandMap[command] || {};

  // Call the rewrite API
  const rewriteResponse = await fetch(`${req.nextUrl.origin}/api/templates/rewrite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: selectedText || fullText || '',
      tone: config.tone || 'neutral',
      length: config.length || 'same',
      variants: 1,
      keep_placeholders: true,
      spam_safe: true,
    }),
  });

  if (!rewriteResponse.ok) {
    const error = await rewriteResponse.json();
    return NextResponse.json({ error: error.error || 'Failed to rewrite' }, { status: rewriteResponse.status });
  }

  const { variants } = await rewriteResponse.json();
  const result = variants?.[0]?.body || variants?.[0]?.subject || '';

  return NextResponse.json({ result });
}









