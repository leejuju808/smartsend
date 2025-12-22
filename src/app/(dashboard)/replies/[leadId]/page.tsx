"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";

type Lead = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  status: string;
  email_id: string | null;    // we store outbound Message-ID or threadId
  thread_id: string | null;   // optional if you also store Gmail threadId
  last_message_snippet: string | null;
};

export default function LeadThreadPage() {
  const params = useParams<{ leadId: string }>();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [lead, setLead] = useState<Lead | null>(null);
  const [thread, setThread] = useState<any>(null);
  const [reply, setReply] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("leads").select("*").eq("id", params.leadId).single();
      setLead(data as any);
    })();
    // eslint-disable-next-line
  }, [params.leadId]);

  useEffect(() => {
    if (!lead?.thread_id) return;
    fetch(`/api/replies/thread/${lead.thread_id}`).then(r=>r.json()).then(setThread);
  }, [lead?.thread_id]);

  const onSend = async () => {
    if (!lead) return;
    // Pull last inbound's headers for reply metadata
    const msgs = thread?.messages ?? [];
    const last = msgs[msgs.length - 1];
    const headers: Record<string,string> = {};
    (last?.payload?.headers ?? []).forEach((h:any)=>headers[h.name]=h.value);

    const payload = {
      to: headers["From"] || lead.email,
      subject: headers["Subject"]?.startsWith("Re:") ? headers["Subject"] : `Re: ${headers["Subject"] || ""}`,
      body: reply,
      inReplyTo: headers["Message-Id"],
      references: headers["References"],
      threadId: thread?.id,
      from: headers["To"] || "" // your connected address will be used
    };

    const r = await fetch("/api/replies/send", { method: "POST", body: JSON.stringify(payload) });
    if (r.ok) {
      setReply("");
      // optimistic UI: mark replied
      await supabase.from("leads").update({ status: "Replied" }).eq("id", lead.id);
    }
  };

  const onArchive = async () => {
    if (!lead) return;
    await supabase.from("leads").update({ status: "Archived" }).eq("id", lead.id);
    router.push("/replies");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{lead?.name || lead?.email}</h1>
          <div className="text-sm opacity-70">{lead?.company || "—"}</div>
        </div>
        <div className="flex items-center gap-2">
          {lead?.status === "Replied" ? <Badge>Replied</Badge> : <Badge variant="secondary">Open</Badge>}
          <Button onClick={onArchive} variant="secondary">Archive</Button>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <div className="p-3 bg-muted text-sm">Thread</div>
        <div className="p-4 space-y-4 max-h-[60vh] overflow-auto">
          {!thread ? (
            <div className="text-sm opacity-70">Loading…</div>
          ) : (thread.messages || []).map((m:any) => {
            const headers: Record<string,string> = {};
            (m.payload.headers || []).forEach((h:any)=>headers[h.name]=h.value);
            const from = headers["From"]; const date = headers["Date"]; const subject = headers["Subject"];
            const snippet = m.snippet;
            return (
              <div key={m.id} className="rounded-xl border p-3">
                <div className="text-sm font-medium">{from}</div>
                <div className="text-xs opacity-70">{date} — {subject}</div>
                <div className="mt-2 text-sm">{snippet}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-medium">Quick Reply</div>
        <Textarea value={reply} onChange={(e:any)=>setReply(e.target.value)} placeholder="Type your reply…" className="min-h-[100px]" />
        <div className="flex gap-2">
          <Button onClick={onSend}>Send</Button>
          <Button variant="secondary" onClick={()=>setReply(prev=>prev + "\n\nBest,\n— SmartSend")}>+ Signature</Button>
        </div>
      </div>
    </div>
  );
}

