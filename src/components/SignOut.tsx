"use client";
import { supabase } from "@/lib/supabaseClient";

export default function SignOut() {
  return (
    <button
      onClick={async () => { 
        await supabase.auth.signOut(); 
        location.href = "/login"; 
      }}
      className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700"
    >
      Sign out
    </button>
  );
}