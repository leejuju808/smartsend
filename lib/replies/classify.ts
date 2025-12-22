// lib/replies/classify.ts

export async function classifyReplies(replyIds: string[]) {
  if (!replyIds.length) return;

  const functionsUrl =
    process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ||
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
  const url = `${functionsUrl}/reply-intent-classifier`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // If you enabled JWT, also send Authorization header
      // Authorization: `Bearer ${supabaseAccessToken}`,
    },
    body: JSON.stringify({ reply_ids: replyIds }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("reply-intent-classifier error:", res.status, text);
    throw new Error("Failed to classify replies");
  }

  return res.json();
}

