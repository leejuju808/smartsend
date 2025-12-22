export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const r = await fetch(baseUrl + "/api/aurev-sync", {
    headers: { "x-aurev-sync-key": process.env.AUREV_SYNC_KEY! }
  });
  return new Response(await r.text(), { status: r.status });
}

