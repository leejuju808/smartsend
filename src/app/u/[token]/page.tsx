import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export default async function UnsubPage({ params }: { params: { token: string } }) {
  const supabase = createServerComponentClient({ cookies });
  // Lookup token → contact
  const { data: t } = await supabase.from("unsub_tokens").select("contact_id,user_id").eq("token", params.token).single();
  let ok = false;
  if (t?.contact_id) {
    const { error } = await supabase.from("contacts").update({ unsubscribed: true }).eq("id", t.contact_id).eq("user_id", t.user_id);
    ok = !error;
  }
  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-semibold">{ok ? "You're unsubscribed" : "Link invalid"}</h1>
      <p className="mt-2 text-gray-600">{ok ? "We've updated your preferences." : "We couldn't process this request."}</p>
    </div>
  );
}

