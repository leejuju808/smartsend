"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { renderTemplate, htmlWithSignature, stripHtml } from "@/lib/template";

type Props = {
  initialSubject?: string;
  initialHtml?: string;
  variables?: Record<string, any>;     // { first_name: "Alex", company: "Acme" }
  signatureHtml?: string;
  onSend: (p: { subject: string; html: string; text: string }) => void;
};

export default function HtmlComposer({ initialSubject = "", initialHtml = "", variables = {}, signatureHtml, onSend }: Props) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const [htmlValue, setHtmlValue] = useState(initialHtml);
  const [rewriting, setRewriting] = useState(false);

  // Update htmlValue when initialHtml changes (e.g., when template is selected)
  useEffect(() => {
    setHtmlValue(initialHtml);
  }, [initialHtml]);

  // Update subject input when initialSubject changes
  useEffect(() => {
    if (subjectRef.current && initialSubject && subjectRef.current.value !== initialSubject) {
      subjectRef.current.value = initialSubject;
    }
  }, [initialSubject]);

  const renderedHtml = useMemo(() => {
    const body = renderTemplate(htmlValue, variables);
    return htmlWithSignature(body, signatureHtml);
  }, [htmlValue, variables, signatureHtml]);

  return (
    <div className="space-y-3">
      <input
        ref={subjectRef}
        defaultValue={initialSubject}
        placeholder="Subject"
        className="w-full border rounded-xl px-3 py-2"
      />

      {/* MVP: textarea (you can swap for TipTap/Quill later) */}
      <textarea
        ref={htmlRef}
        value={htmlValue}
        onChange={(e) => setHtmlValue(e.target.value)}
        placeholder='Write in HTML or use {{first_name}} / {{company|there}}'
        rows={10}
        className="w-full border rounded-xl px-3 py-2 font-mono"
      />

      <div className="rounded-2xl border">
        <div className="px-3 py-2 text-xs text-gray-500">Preview</div>
        <div className="p-4 prose max-w-none" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      </div>

      <div className="flex justify-end gap-2">
        <button
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-xl disabled:opacity-50"
          disabled={rewriting || !htmlValue.trim()}
          onClick={async () => {
            setRewriting(true);
            try {
              const res = await fetch("/api/ai/rewrite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ html: htmlValue, tone: "concise, friendly, professional" }),
              });
              if (res.ok) {
                const rewritten = await res.text();
                setHtmlValue(rewritten);
              } else {
                alert("Failed to rewrite");
              }
            } catch (e) {
              alert(`Rewrite error: ${String(e)}`);
            } finally {
              setRewriting(false);
            }
          }}
        >
          {rewriting ? "Rewriting…" : "Rewrite"}
        </button>
        <button
          className="bg-black text-white px-4 py-2 rounded-xl"
          onClick={() => {
            const subj = subjectRef.current?.value || "";
            const html = renderedHtml;
            const text = stripHtml(renderedHtml);
            onSend({ subject: subj, html, text });
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

