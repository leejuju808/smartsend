"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Copy, Send, Check } from "lucide-react";
import { toast } from "sonner";

type Playbook = {
  id: string;
  playbook_name: string;
  tone: "friendly" | "firm" | "assertive" | "escalation";
  subject_template: string;
  body_template: string;
};

type GeneratedEmail = {
  subject: string;
  body: string;
  playbook_name: string;
  tone: string;
  adjuster_email?: string | null;
};

const TONE_COLORS: Record<string, string> = {
  friendly: "bg-green-100 text-green-800 border-green-200",
  firm: "bg-yellow-100 text-yellow-800 border-yellow-200",
  assertive: "bg-orange-100 text-orange-800 border-orange-200",
  escalation: "bg-red-100 text-red-800 border-red-200",
};

export default function AdjusterCommunicationPage() {
  const params = useParams();
  const jobId = params.jobId as string;

  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [email, setEmail] = useState<GeneratedEmail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(true);
  const [adjusterName, setAdjusterName] = useState("");
  const [adjusterEmail, setAdjusterEmail] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Load playbooks
    fetch("/api/adjuster-playbooks")
      .then((r) => r.json())
      .then((d) => {
        setPlaybooks(d.playbooks || []);
        setLoadingPlaybooks(false);
      })
      .catch((err) => {
        console.error("Error loading playbooks:", err);
        setLoadingPlaybooks(false);
      });
  }, []);

  const buildEmail = async (playbookId: string) => {
    if (!jobId) {
      toast.error("Job ID is missing");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/job/${jobId}/build-adjuster-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playbook_id: playbookId,
          adjuster_name: adjusterName || undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate email");
      }

      const data = await res.json();
      setEmail(data);
      if (data.adjuster_email) {
        setAdjusterEmail(data.adjuster_email);
      }
      toast.success("Email generated successfully");
    } catch (error: any) {
      console.error("Error building email:", error);
      toast.error(error.message || "Failed to generate email");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!email) return;

    const fullEmail = `Subject: ${email.subject}\n\n${email.body}`;
    navigator.clipboard.writeText(fullEmail);
    setCopied(true);
    toast.success("Email copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendEmail = () => {
    if (!email || !adjusterEmail) {
      toast.error("Please enter adjuster email address");
      return;
    }

    const mailtoLink = `mailto:${adjusterEmail}?subject=${encodeURIComponent(
      email.subject
    )}&body=${encodeURIComponent(email.body)}`;

    window.location.href = mailtoLink;
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Adjuster Communication</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Generate professional emails to insurance adjusters using AI-powered templates
        </p>
      </div>

      {/* Adjuster Info Input */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-50">Adjuster Information</CardTitle>
          <CardDescription className="text-zinc-400">
            Optional: Enter adjuster details for personalized emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="adjuster-name" className="text-zinc-300">
                Adjuster Name
              </Label>
              <Input
                id="adjuster-name"
                value={adjusterName}
                onChange={(e) => setAdjusterName(e.target.value)}
                placeholder="John Smith"
                className="bg-zinc-900 border-zinc-700 text-zinc-50"
              />
            </div>
            <div>
              <Label htmlFor="adjuster-email" className="text-zinc-300">
                Adjuster Email
              </Label>
              <Input
                id="adjuster-email"
                type="email"
                value={adjusterEmail}
                onChange={(e) => setAdjusterEmail(e.target.value)}
                placeholder="adjuster@insurance.com"
                className="bg-zinc-900 border-zinc-700 text-zinc-50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Playbook Selection */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-50">Select Email Template</CardTitle>
          <CardDescription className="text-zinc-400">
            Choose a template based on your communication stage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPlaybooks ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="grid gap-3">
              {playbooks.map((playbook) => (
                <button
                  key={playbook.id}
                  className="border rounded-lg p-4 text-left hover:bg-zinc-900 transition-colors border-zinc-800"
                  onClick={() => buildEmail(playbook.id)}
                  disabled={loading}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-zinc-50">
                        {playbook.playbook_name}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        {playbook.tone.toUpperCase()} tone
                      </div>
                    </div>
                    <Badge
                      className={`${TONE_COLORS[playbook.tone] || "bg-gray-100 text-gray-800"} border`}
                    >
                      {playbook.tone}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generated Email */}
      {loading && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="py-8">
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              <span className="ml-2 text-zinc-400">Generating email...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {email && !loading && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-zinc-50">Generated Email</CardTitle>
                <CardDescription className="text-zinc-400">
                  Template: {email.playbook_name} ({email.tone} tone)
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Open in Email Client
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-zinc-300 mb-2 block">Subject:</Label>
              <div className="p-3 border rounded bg-zinc-900 border-zinc-700 text-zinc-50">
                {email.subject}
              </div>
            </div>
            <div>
              <Label className="text-zinc-300 mb-2 block">Body:</Label>
              <Textarea
                value={email.body}
                readOnly
                className="min-h-[300px] bg-zinc-900 border-zinc-700 text-zinc-50 font-mono text-sm whitespace-pre-wrap"
              />
            </div>
            <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-800">
              <p>
                💡 Tip: Review and customize the email before sending. You can edit the text
                directly in the textarea above.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}



































