export async function previewTemplate(id: string, vars: any) {
  const res = await fetch(`/api/templates/${id}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vars })
  });
  const j = await res.json();
  if (!res.ok || !j.ok) throw new Error(j.error || "Preview failed");
  return j as { ok: true; subject: string; html: string; missing: string[]; status: string };
}