Deno.serve(async (req) => {
  const { owner_id, campaign_id, label, vars, previous_thread_subject, prefer_reply } =
    await req.json();

  if (!owner_id || !label) {
    return new Response("Missing params", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const useReplyThread = !!previous_thread_subject && prefer_reply !== false;

  const { data: pick, error } = await supabase.rpc("pick_subject_ucb", {
    owner: owner_id,
    campaign: campaign_id ?? null,
    label_input: label,
    c: 0.8,
  }).single();

  if (error || !pick) {
    return new Response("No subject variants", { status: 404 });
  }

  const rendered = sanitizeSubject(renderTemplate(pick.template, vars || {}));

  const subject = useReplyThread ? `Re: ${previous_thread_subject}` : rendered;

  return new Response(
    JSON.stringify({
      subject,
      subject_id: pick.subject_id,
      is_override: pick.is_override,
      style: pick.style,
      use_reply_thread: useReplyThread,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function renderTemplate(template: string, vars: Record<string, string> = {}) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}

function sanitizeSubject(subject: string) {
  const banned = [/free!!!/gi, /risk[-\s]?free/gi, /guarantee/gi, /limited time/gi];
  let cleaned = subject.replace(/\s+/g, " ").trim();

  for (const pattern of banned) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  if (cleaned.length > 78) {
    cleaned = `${cleaned.slice(0, 75)}…`;
  }

  if (/^[a-z]/.test(cleaned)) {
    cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

