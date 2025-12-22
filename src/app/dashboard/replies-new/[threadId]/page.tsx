"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useThreadNew } from "@/hooks/useThreadNew";
import MessageBubble from "@/components/replies-new/MessageBubble";
import ReplyBox from "@/components/replies-new/ReplyBox";
import { createClientComponentClient } from "@/lib/supabase";
import { NudgeBanner } from "@/components/thread/NudgeBanner";

export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const supabase = createClientComponentClient();

  const { messages, loading } = useThreadNew(threadId);
  const [meta, setMeta] = useState<{
    subject: string | null;
    lead_email: string;
    from_email?: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("threads_new")
        .select("subject, lead_email")
        .eq("id", threadId)
        .single();
      setMeta(data as any);
    })();
  }, [supabase, threadId]);

  const lastInbound = useMemo(
    () => [...messages].reverse().find((m) => m.direction === "inbound"),
    [messages]
  );

  // TODO: replace with the user's connected mailbox address
  const fromEmail = "me@smartsendhq.com";
  const toEmail = meta?.lead_email || "";

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] p-6">
      <div className="pb-3 border-b">
        <h2 className="text-lg font-semibold">{meta?.subject ?? "(no subject)"}</h2>
        <div className="text-sm text-muted-foreground">
          {meta?.lead_email} • {messages.length} message
          {messages.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 py-4">
        {loading && <div>Loading thread…</div>}
        {!loading &&
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              direction={m.direction}
              from={m.from_email}
              time={m.sent_at}
              html={m.body_html || undefined}
              text={m.body_text || undefined}
            />
          ))}
      </div>

      <div className="pt-3 border-t">
        <div className="pb-3">
          <NudgeBanner threadId={threadId} />
        </div>
        <ReplyBox
          threadId={threadId}
          fromEmail={fromEmail}
          toEmail={toEmail}
          onSent={() => {
            // optimistic actions if you want (already realtime)
          }}
        />
        <div className="flex gap-2 mt-2">
          <ThreadActions threadId={threadId} />
        </div>
      </div>
    </div>
  );
}

function ThreadActions({ threadId }: { threadId: string }) {
  const supabase = createClientComponentClient();

  const mark = async (status: "open" | "replied" | "archived") => {
    await supabase.from("threads_new").update({ status }).eq("id", threadId);
  };

  return (
    <>
      <button
        onClick={() => mark("open")}
        className="px-3 py-1 rounded-xl border"
      >
        Mark open
      </button>
      <button
        onClick={() => mark("replied")}
        className="px-3 py-1 rounded-xl border"
      >
        Mark replied
      </button>
      <button
        onClick={() => mark("archived")}
        className="px-3 py-1 rounded-xl border"
      >
        Archive
      </button>
    </>
  );
}

