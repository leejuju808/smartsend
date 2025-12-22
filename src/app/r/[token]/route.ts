import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false }
    }
  );

  const token = params.token;
  const ua = req.headers.get("user-agent") || "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const country = req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry") || "";

  let dest = "https://smartsendhq.com/";

  try {
    const { data } = await admin
      .from("tracking_tokens")
      .select("url")
      .eq("token", token)
      .maybeSingle();

    if (data?.url) {
      dest = data.url;
    }

    await admin.rpc("record_tracking_event", {
      p_token: token,
      p_type: "click",
      p_ua: ua,
      p_ip: ip || null,
      p_country: country || null
    });
  } catch (error) {
    console.error("tracking redirect error", error);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: dest,
      "cache-control": "no-store"
    }
  });
}