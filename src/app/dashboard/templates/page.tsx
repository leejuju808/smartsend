"use client";
import { useState } from "react";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export default function TemplatesPage() {
  const [input, setInput] = useState("Hey {{first_name}},\nHope you're doing well! I wanted to share how we help companies like {{company}} drive more leads using automation.\nWould love to set up a quick call this week.");
  const [output, setOutput] = useState("");
  const [tone, setTone] = useState("friendly");
  const [length, setLength] = useState("medium");
  const [goal, setGoal] = useState("book a meeting");
  const [loading, setLoading] = useState(false);

  async function rewrite() {
    setLoading(true);
    const res = await fetch("/api/rewrite-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input, tone, length, goal }),
    });
    const j = await res.json();
    setOutput(j.result || "");
    setLoading(false);
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Smart Template Rewriter ⚡</h1>

      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="text-sm">Tone</label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="persuasive">Persuasive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm">Length</label>
          <Select value={length} onValueChange={setLength}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Short</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="long">Long</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm">Goal</label>
          <Select value={goal} onValueChange={setGoal}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="book a meeting">Book a Meeting</SelectItem>
              <SelectItem value="demo request">Demo Request</SelectItem>
              <SelectItem value="generate reply">Generate Reply</SelectItem>
              <SelectItem value="warm follow-up">Warm Follow-up</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="font-semibold">Original Template</label>
          <Textarea className="h-64" value={input} onChange={e=>setInput(e.target.value)} />
        </div>
        <div>
          <label className="font-semibold">Rewritten Version</label>
          <Textarea className="h-64 bg-muted" value={output} readOnly />
        </div>
      </div>

      <Button onClick={rewrite} disabled={loading}>
        {loading ? "Rewriting…" : "Rewrite Template"}
      </Button>
    </div>
  );
}
