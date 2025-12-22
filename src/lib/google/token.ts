import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function getGmailAccessToken() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("user_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .eq("provider", "gmail")
    .single();

  if (error || !data) throw new Error("No Gmail connection");
  return data.access_token as string;
}

