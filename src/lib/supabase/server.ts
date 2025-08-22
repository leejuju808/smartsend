import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
// import type { Database } from "@/types/supabase";

export function getSupabaseServer() {
  // @ts-ignore - drop Database if you don’t have typed gen
  return createServerComponentClient<any>({ cookies });
}

