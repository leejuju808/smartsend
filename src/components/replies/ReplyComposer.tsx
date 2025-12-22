"use client";

import { useState, useEffect } from "react";
import { getBrowserSupabase } from "@/utils/supabase/client";
import { useToast } from "@/components/ui/toast/ToastProvider";

export default function ReplyComposer({
  threadId,
  projectId,
  onSend,
}: {
  threadId: string;
  projectId: string;
  onSend: () => void;
}) {
  const supabase = getBrowserSupabase();
  const { push } = useToast();
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [tone, setTone] = useState("direct"); // direct | friendly | professional | curious
  const [length, setLength] = useState("short"); // short | medium | long
  const [userEmail, setUserEmail] = useState("");
  const [leadEmail, setLeadEmail] = useState("");

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email || "");
      
      const { data: thread } = await supabase
        .from("threads")
        .select("lead_id, leads(email)")
        .eq("id", threadId)
        .single();
      
      if (thread && thread.leads) {
        setLeadEmail((thread.leads as any).email);
      }
    }
    loadData();
  }, [threadId, supabase]);

  async function handleSend() {
    if (!body.trim() && !subject.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("messages").insert({
      thread_id: threadId,
      direction: "out",
      from_email: userEmail,
      to_email: leadEmail,
      subject: subject || null,
      body_text: body,
    });
    setBusy(false);
    if (error) {
      push({
        title: "Send failed",
        description: error.message,
        type: "error"
      });
      return;
    }
    push({
      title: "Sent",
      description: "Message sent successfully",
      type: "success"
    });
    setBody("");
    setSubject("");
    onSend();
  }

  async function rewrite(field: "subject" | "body") {
    const text = field === "subject" ? (subject || body.slice(0, 120)) : body;
    if (!text.trim()) {
      push({
        title: "Nothing to rewrite",
        description: "Please enter some text first",
        type: "error"
      });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-rewriter", {
        body: { text, tone, length, vars: {} },
      });
      if (error) {
        throw new Error(error.message || "Rewrite failed");
      }
      if (field === "subject") {
        setSubject((data?.text || "").replace(/\n/g, " ").trim());
      } else {
        setBody((data?.text || "").trim());
      }
      push({
        title: "Rewritten",
        description: "Text has been rewritten",
        type: "success"
      });
    } catch (e: any) {
      push({
        title: "Rewrite failed",
        description: e?.message || "Rewrite failed",
        type: "error"
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t p-3 space-y-2">
      <div className="flex gap-2 items-center">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject (optional)"
          className="flex-1 p-2 border rounded"
        />
        <button
          onClick={() => rewrite("subject")}
          className="text-xs border rounded px-2 py-1"
          disabled={busy}
        >
          Rewrite Subject
        </button>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="w-full p-2 border rounded resize-y"
        placeholder="Write your message…"
      />

      <div className="flex items-center gap-2 text-xs">
        <label>Tone</label>
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="direct">Direct</option>
          <option value="friendly">Friendly</option>
          <option value="professional">Professional</option>
          <option value="curious">Curious</option>
          <option value="concise">Concise</option>
        </select>
        <label>Length</label>
        <select
          value={length}
          onChange={(e) => setLength(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="short">Short</option>
          <option value="medium">Medium</option>
          <option value="long">Long</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => rewrite("body")}
            className="border rounded px-3 py-1"
            disabled={busy}
          >
            Rewrite Body
          </button>
          <button
            onClick={handleSend}
            disabled={busy}
            className="bg-blue-600 text-white rounded px-3 py-1"
          >
            {busy ? "Working…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
