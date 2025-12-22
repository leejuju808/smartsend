export async function GET() {
  const r = await fetch(process.env.AGENTCLOUD_URL + "/api/aurev-sync", {
    headers: { "x-aurev-sync-key": process.env.AUREV_SYNC_KEY! }
  });
  return new Response(await r.text(), { status: r.status });
}

