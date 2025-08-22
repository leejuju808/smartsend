import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { normalizeEmail, emailDomain } from "./email";

export async function isSuppressedForCurrentUser(email: string) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { suppressed: false };
  const e = normalizeEmail(email);
  const d = emailDomain(e);
  const { data, error } = await supabase
    .from("suppressions")
    .select("id, kind, value_lower")
    .in("value_lower", [e, d])
    .in("kind", ["email", "domain"])
    .eq("user_id", user.id);
  if (error) return { suppressed: false };
  const hit = (data || []).find(
    (row) => (row.kind === "email" && row.value_lower === e) ||
             (row.kind === "domain" && row.value_lower === d)
  );
  return { suppressed: !!hit };
}

