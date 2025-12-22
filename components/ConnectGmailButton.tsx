"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

export default function ConnectGmailButton() {
  const [uid, setUid] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  return (
    <a
      href={`/api/oauth/google/start?next=/inboxes&uid=${uid ?? ""}`}
      className="rounded-2xl px-4 py-2 bg-black text-white hover:opacity-90"
    >
      Connect Gmail
    </a>
  );
}
