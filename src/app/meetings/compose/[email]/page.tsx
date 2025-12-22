"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/**
 * Meeting reply composer:
 * - Shows a ready-to-copy reply email body including Calendly URL.
 * - Offers "Download .ics" which calls our ICS API with chosen date/time.
 * This page is a simple utility to speed "reply → meeting" flow.
 */

function isoLocal(date: Date) {
  // Return a YYYY-MM-DDTHH:MM for <input type="datetime-local">
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ComposeMeetingPage() {
  const params = useParams<{ email: string }>();
  const [toEmail] = React.useState(decodeURIComponent(params.email));
  const [senderName, setSenderName] = React.useState("Julian from SmartSend");
  const [senderEmail, setSenderEmail] = React.useState("julian@example.com");
  const [calendlyUrl, setCalendlyUrl] = React.useState(process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/your-handle/15min");

  const now = React.useMemo(() => new Date(), []);
  const defaultEnd = React.useMemo(() => new Date(now.getTime() + 15 * 60 * 1000), [now]);
  const [startISO, setStartISO] = React.useState(isoLocal(now));
  const [endISO, setEndISO] = React.useState(isoLocal(defaultEnd));
  const [subject, setSubject] = React.useState("Quick 15-min intro call?");
  const [location, setLocation] = React.useState("Google Meet / Zoom");
  const [body, setBody] = React.useState("");

  React.useEffect(() => {
    const template = `Hey ${toEmail.split("@")[0]},\n\nHappy to set up a quick call. You can grab a time here: ${calendlyUrl}\n\nIf you prefer, I attached a calendar invite for ${new Date(startISO).toLocaleString()}.\n\nAgenda: quick context + see if we can help you book more meetings from replies.\n\nBest,\n${senderName}`;
    setBody(template);
  }, [toEmail, calendlyUrl, startISO, senderName]);

  async function downloadICS() {
    const res = await fetch("/api/meetings/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Intro call",
        description: "Quick intro and SmartSend fit check",
        location,
        organizer: { name: senderName, email: senderEmail },
        attendee: { name: toEmail.split("@")[0], email: toEmail },
        startISO: new Date(startISO).toISOString(),
        endISO: new Date(endISO).toISOString(),
        filename: "intro-call.ics",
        url: calendlyUrl
      })
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "intro-call.ics";
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Failed to generate invite");
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Compose Meeting Reply</h1>

      <Card>
        <CardContent className="p-6 grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">To</label>
              <Input value={toEmail} readOnly />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Subject</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Your Name</label>
              <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Your Email</label>
              <Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Calendly URL</label>
              <Input value={calendlyUrl} onChange={(e) => setCalendlyUrl(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Location</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Start</label>
              <Input type="datetime-local" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">End</label>
              <Input type="datetime-local" value={endISO} onChange={(e) => setEndISO(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Email Body</label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="flex gap-3 pt-3">
              <Button onClick={() => copy(subject)}>Copy Subject</Button>
              <Button onClick={() => copy(body)} variant="secondary">Copy Body</Button>
              <Button onClick={downloadICS} variant="outline">Download .ics</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}