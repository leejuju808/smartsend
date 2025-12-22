"use client";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/utils/supabase/client";

type Email = {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  reply_from?: string | null;
  reply_subject?: string | null;
  reply_text?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  sent_at?: string | null;
  created_at?: string;
};

export default function InboxList() {
  const [emails, setEmails] = useState<Email[]>([]);
  const supabase = getBrowserSupabase();

  useEffect(() => {
    // Initial load
    const loadEmails = async () => {
      const { data } = await supabase
        .from("email_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setEmails(data);
    };
    loadEmails();

    // Live update tracking using Supabase's realtime channel
    const channel = supabase
      .channel("email_updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "email_logs" },
        (payload) => {
          setEmails((prev) =>
            prev.map((e) => (e.id === payload.new.id ? payload.new : e))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Inbox</h2>
      <div className="space-y-2">
        {emails.map((email) => (
          <div key={email.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{email.to_email}</p>
                <p className="text-sm text-gray-600">{email.subject}</p>
                <p className="text-xs text-gray-500">
                  Status: {email.status}
                </p>
                {email.reply_from && (
                  <div className="mt-2 p-2 bg-blue-50 rounded">
                    <p className="text-xs font-semibold">Reply from: {email.reply_from}</p>
                    {email.reply_subject && (
                      <p className="text-xs">Subject: {email.reply_subject}</p>
                    )}
                    {email.reply_text && (
                      <p className="text-xs mt-1 truncate">{email.reply_text}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-400">
                {email.sent_at ? new Date(email.sent_at).toLocaleString() : "-"}
              </div>
            </div>
            {(email.opened_at || email.clicked_at) && (
              <div className="mt-2 flex gap-4 text-xs">
                {email.opened_at && (
                  <span className="text-green-600">
                    Opened: {new Date(email.opened_at).toLocaleString()}
                  </span>
                )}
                {email.clicked_at && (
                  <span className="text-blue-600">
                    Clicked: {new Date(email.clicked_at).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
