// supabase/functions/_shared/mailboxSafety.ts
// Block 10000 - Mailbox Safety Guard Helper
// Safe RPC wrapper for reserving send slots

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export async function reserveSendSlot(accountId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("smartsend_reserve_send_slot", {
    p_account_id: accountId
  });

  if (error) {
    console.error("smartsend_reserve_send_slot error", error);
    // be safe and treat as "no slot"
    return false;
  }

  // Postgres boolean comes back as true/false or sometimes null
  return data === true;
}


































































