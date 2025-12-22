// Block 20240 — Reply Composer with Templates
// Reply composer with saved reply templates

"use client";

import { useEffect, useState } from "react";

type TemplateRow = {
  id: string;
  name: string;
  category?: string | null;
  subject_template?: string | null;
  body_template: string;
};

interface ReplyComposerProps {
  conversationId: string;
  accountId?: string | null;
  workspaceId?: string | null; // Legacy support
  homeownerName?: string | null;
  homeownerEmail?: string | null;
  defaultSubject?: string | null;
  onSent?: (conversation: any) => void;
}

export function ReplyComposer({
  conversationId,
  accountId,
  workspaceId,
  homeownerName,
  homeownerEmail,
  defaultSubject,
  onSent,
}: ReplyComposerProps) {
  const [subject, setSubject] = useState(defaultSubject || "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  useEffect(() => {
    if (defaultSubject) {
      setSubject(defaultSubject);
    }
  }, [defaultSubject]);

  // Load templates once
  useEffect(() => {
    async function load() {
      setLoadingTemplates(true);
      try {
        const res = await fetch("/api/reply-templates");
        const json = await res.json();
        setTemplates(json.templates ?? []);
      } catch (err) {
        console.error("Failed to load reply templates", err);
      } finally {
        setLoadingTemplates(false);
      }
    }
    load();
  }, []);

  function renderTemplateVariables(t: TemplateRow): { subject: string; body: string } {
    const vars: Record<string, string> = {
      homeowner_name: homeownerName || "",
      company_name: "Your roofing company", // TODO: replace with real company name from account
    };

    function replaceVars(text: string | null | undefined): string {
      if (!text) return "";
      let out = text;
      Object.entries(vars).forEach(([key, value]) => {
        const token = `{{${key}}}`;
        out = out.split(token).join(value || "");
      });
      return out;
    }

    return {
      subject: replaceVars(t.subject_template || ""),
      body: replaceVars(t.body_template),
    };
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    const rendered = renderTemplateVariables(t);

    // if subject is empty, fill it. If not, leave as is.
    if (!subject && rendered.subject) {
      setSubject(rendered.subject);
    }
    // append to body if already typed, otherwise replace
    if (!body) {
      setBody(rendered.body);
    } else {
      setBody((prev) => prev + "\n\n" + rendered.body);
    }
  }

  async function send() {
    if (!body.trim() && !subject.trim()) return;
    setSending(true);

    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          account_id: accountId || workspaceId, // Support both
          subject: subject || defaultSubject || "",
          body,
        }),
      });

      const json = await res.json();

      if (json?.conversation && onSent) {
        onSent(json.conversation);
        setBody("");
        // keep subject for thread, usually same subject
      } else if (json?.error) {
        alert(`Failed to send: ${json.error}`);
      }
    } catch (error) {
      console.error("Failed to send reply:", error);
      alert("Failed to send reply. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-600 font-medium">
          Reply to homeowner
        </p>
        <div className="flex items-center gap-2 text-[11px]">
          <select
            value={selectedTemplateId}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              applyTemplate(id);
            }}
            className="border rounded-full px-2 py-1 bg-white text-xs max-w-[220px]"
          >
            <option value="">
              {loadingTemplates ? "Loading templates…" : "Insert template…"}
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full border rounded-lg px-3 py-1 text-xs"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Write your reply…"
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
        />
      </div>

      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={send}
          disabled={sending || (!body.trim() && !subject.trim())}
          className="px-4 py-1.5 rounded-full bg-black text-white text-xs disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send reply"}
        </button>
      </div>
    </div>
  );
}
