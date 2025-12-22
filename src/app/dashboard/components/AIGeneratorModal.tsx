"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

export default function AIGeneratorModal({ onGenerate }: { onGenerate: (data: { subject: string, body: string }) => void }) {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      setSubject(data.subject);
      setBody(data.body);
      onGenerate(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="bg-yellow-500 text-black font-semibold">⚡ Generate Email</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>AI Email Generator</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Enter topic (e.g. lead follow-up for solar installs)" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? "Generating..." : "Generate with AI"}
          </Button>
          {subject && (
            <div className="space-y-2 mt-3">
              <Input value={subject} readOnly />
              <Textarea value={body} rows={5} readOnly />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}