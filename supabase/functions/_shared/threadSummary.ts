import OpenAI from "https://esm.sh/openai@4";

const client = new OpenAI(Deno.env.get("OPENAI_API_KEY")!);

export async function summarizeThread(threadId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Fetch last 5 messages
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/smartsend_thread_messages?thread_id=eq.${threadId}&order=sent_at.desc&limit=5`,
    {
      headers: { 
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch messages: ${resp.statusText}`);
  }

  const messages = await resp.json();

  if (!messages || messages.length === 0) {
    return "No messages in thread.";
  }

  const text = messages
    .reverse() // Reverse to get chronological order
    .map((m: any) => `${m.direction}: ${m.body || ""}`)
    .join("\n\n");

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `Summarize this email thread in under 50 words:\n\n${text}`
      }
    ]
  });

  return res.choices[0].message.content?.trim() || "";
}








