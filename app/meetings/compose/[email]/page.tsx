"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/Textarea";

export default function MeetingComposePage() {
  const params = useParams();
  const router = useRouter();
  const email = decodeURIComponent(params.email as string);
  
  const [subject, setSubject] = React.useState("Quick 15-min intro?");
  const [body, setBody] = React.useState(`Hey ${email.split('@')[0]},

Grab a time here: https://calendly.com/your-handle/15min
I attached a calendar invite too.

— Julian`);
  const [startDate, setStartDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("18:00");
  const [duration, setDuration] = React.useState("15");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);

  // Set default start date to tomorrow
  React.useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setStartDate(tomorrow.toISOString().split('T')[0]);
  }, []);

  async function sendMeeting() {
    if (!startDate || !startTime) {
      alert("Please set meeting date and time");
      return;
    }

    setLoading(true);
    try {
      const startISO = new Date(`${startDate}T${startTime}:00.000Z`).toISOString();
      const endISO = new Date(new Date(startISO).getTime() + parseInt(duration) * 60000).toISOString();

      const response = await fetch('/api/replies/send-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject,
          body,
          startISO,
          endISO,
          organizerName: "Julian from SmartSend",
          organizerEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@yourdomain.com",
          calendlyUrl: "https://calendly.com/your-handle/15min"
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setResult({ success: true, data });
      } else {
        setResult({ success: false, error: data.error });
      }
    } catch (error: any) {
      setResult({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  }

  function downloadICS() {
    if (!startDate || !startTime) {
      alert("Please set meeting date and time");
      return;
    }

    const startISO = new Date(`${startDate}T${startTime}:00.000Z`).toISOString();
    const endISO = new Date(new Date(startISO).getTime() + parseInt(duration) * 60000).toISOString();

    // Call the ICS API to generate the file
    fetch('/api/ics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: "Intro call",
        description: "Quick intro & SmartSend fit check",
        startISO,
        durationMin: parseInt(duration),
        organizerEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@yourdomain.com",
        organizerName: "Julian from SmartSend",
        location: "Google Meet / Zoom",
      }),
    })
    .then(response => response.text())
    .then(icsContent => {
      const blob = new Blob([icsContent], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'intro-call.ics';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    })
    .catch(error => {
      console.error('Failed to generate ICS:', error);
      alert('Failed to generate ICS file');
    });
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Compose Meeting Reply</h1>
        <Button variant="outline" onClick={() => router.back()}>
          ← Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meeting Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email">To</Label>
            <Input id="email" value={email} disabled />
          </div>
          
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input 
              id="subject" 
              value={subject} 
              onChange={(e) => setSubject(e.target.value)} 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input 
                id="date" 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
              />
            </div>
            <div>
              <Label htmlFor="time">Time (UTC)</Label>
              <Input 
                id="time" 
                type="time" 
                value={startTime} 
                onChange={(e) => setStartTime(e.target.value)} 
              />
            </div>
          </div>

          <div>
            <Label htmlFor="duration">Duration (minutes)</Label>
            <Input 
              id="duration" 
              type="number" 
              value={duration} 
              onChange={(e) => setDuration(e.target.value)} 
              min="5"
              max="120"
            />
          </div>
          
          <div>
            <Label htmlFor="body">Message Body</Label>
            <Textarea 
              id="body" 
              value={body} 
              onChange={(e) => setBody(e.target.value)} 
              rows={6}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button onClick={downloadICS} variant="outline">
          Download .ics
        </Button>
        <Button onClick={sendMeeting} disabled={loading}>
          {loading ? "Sending..." : "Send Meeting Reply"}
        </Button>
      </div>

      {result && (
        <Card>
          <CardContent className="p-4">
            {result.success ? (
              <div className="text-green-600">
                <h3 className="font-semibold">Success!</h3>
                <p>Meeting reply sent successfully.</p>
                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-red-600">
                <h3 className="font-semibold">Error</h3>
                <p>{result.error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}