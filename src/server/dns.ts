export async function dnsTxt(name: string): Promise<string[]> {
  const headers = { Accept: "application/dns-json" } as const;
  const urls = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=16`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers, cache: "no-store" });
      const j = await r.json();
      const answers = (j?.Answer || j?.answer || []) as any[];
      const txts = answers
        .filter(a => a.type === 16 || a.type === "TXT")
        .flatMap(a => String(a.data || a?.data || "")
          .replace(/^"|"$/g, "")
          .replace(/\\"/g, '"')
          .split('" "'))
        .map(s => s.trim())
        .filter(Boolean);
      if (txts.length) return txts;
    } catch {
      // try next resolver
    }
  }
  return [];
}

