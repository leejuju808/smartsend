import { createClient } from "./supabase/server";

export function createServerClient() {
  return createClient();
}

