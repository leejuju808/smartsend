"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AIGeneratorModal from "./AIGeneratorModal";
import SmartRewriter from "@/components/SmartRewriter";

export default function EmailComposer() {
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string>(""); // optional

  async function addToQueue() {
    setLoading(true);
    try {
      const res = await fetch("/api/queue-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          to: toEmail, 
          subject, 
          html: body, 
          scheduledFor: scheduledAt || undefined 
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to queue email");
      }
      setToEmail("");
      setSubject("");
      setBody("");
      setScheduledAt("");
      alert("Queued ✅");
    } catch (e) {
      console.error(e);
      alert(`Could not queue email: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl p-4 border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Compose Email</h3>
        <AIGeneratorModal
          onGenerate={(d) => {
            setSubject(d.subject);
            setBody(d.body);
          }}
        />
      </div>

      <Input
        placeholder="Recipient email (e.g. owner@localbiz.com)"
        value={toEmail}
        onChange={(e) => setToEmail(e.target.value)}
      />
      <Input
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <Textarea
        placeholder="Email body (HTML supported)"
        rows={10}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      
      <SmartRewriter
        defaultValue={body}
        onRewrite={(newText) => setBody(newText)}
      />
      <Input
        type="datetime-local"
        value={scheduledAt}
        onChange={(e) => setScheduledAt(e.target.value)}
        placeholder="Schedule (optional)"
      />

      <div className="flex gap-2">
        <Button className="bg-yellow-500 text-black" onClick={addToQueue} disabled={loading}>
          {loading ? "Queuing..." : "Add to Send Queue"}
        </Button>
        <Button variant="secondary" onClick={() => { setSubject(""); setBody(""); }}>
          Clear
        </Button>
      </div>
    </div>
  );
}