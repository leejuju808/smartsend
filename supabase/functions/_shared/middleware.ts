export function assertBearer(req: Request, env: Record<string, string>) {
  const auth = req.headers.get("authorization") ?? "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const ok = auth.startsWith("Bearer ") && key.length > 0 && auth.includes(key);
  if (!ok) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

export async function readJson<T>(
  req: Request,
  shape: (x: unknown) => T
): Promise<T> {
  const body = await req.json().catch(() => {
    throw new Response("Bad Request", { status: 400 });
  });
  try {
    return shape(body);
  } catch {
    throw new Response("Bad Request", { status: 400 });
  }
}

export const shapes = {
  threadId(x: any) {
    if (!x || typeof x.thread_id !== "string") throw 0;
    return { thread_id: x.thread_id as string };
  },
  runId(x: any) {
    if (!x || typeof x.run_id !== "string") throw 0;
    const batch = Number(x.batch ?? 100);
    const clamped = Math.min(Math.max(Number.isFinite(batch) ? batch : 100, 1), 500);
    return { run_id: x.run_id as string, batch: clamped };
  },
};







