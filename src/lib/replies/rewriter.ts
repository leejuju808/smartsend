export async function rewriteText(text: string, tone: string = "professional"): Promise<string> {
  const res = await fetch("/api/ai/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, tone }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Failed to rewrite" }));
    throw new Error(error.error || await res.text() || "Failed to rewrite");
  }

  const data = await res.json();
  return data.rewritten || text;
}

