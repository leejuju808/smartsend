import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export const handler = async (req: Request): Promise<Response> => {
  const { to, link } = await req.json();
  return new Response(JSON.stringify({ ok: true, to, link }), {
    headers: { "content-type": "application/json" },
  });
};

Deno.serve(handler);




