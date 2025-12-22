import { resubmitDeadLetter } from "@/lib/db/queueHealth";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: "missing_id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    await resubmitDeadLetter(id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error?.message ?? "unknown_error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}












