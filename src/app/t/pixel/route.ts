import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ce3iW8AAAAASUVORK5CYII=";
const PNG_BYTES = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));

export async function GET(req: Request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false }
    }
  );

  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  const ua = req.headers.get("user-agent") || "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const country = req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry") || "";

  if (token) {
    await admin
      .rpc("record_tracking_event", {
        p_token: token,
        p_type: "open",
        p_ua: ua,
        p_ip: ip || null,
        p_country: country || null
      })
      .catch(() => undefined);
  }

  return new Response(PNG_BYTES, {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "content-disposition": "inline; filename=p.png"
    }
  });
}












