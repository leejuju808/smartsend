// app/dashboard/hot-leads/[leadId]/_components/HotLeadReplyTemplates.tsx
// Block 97000 — One-Click Reply Templates Component

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Copy, Check } from "lucide-react";
import { toast } from "sonner";

type Template = {
  id: string;
  title: string;
  body: string;
  subject: string | null;
};

export function HotLeadReplyTemplates({
  leadId,
  leadEmail,
  leadName,
}: {
  leadId: string;
  leadEmail: string;
  leadName: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const response = await fetch("/api/hot-leads/templates");
        if (response.ok) {
          const data = await response.json();
          setTemplates(data);
        }
      } catch (error) {
        console.error("Error fetching templates:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  const handleCopyTemplate = (template: Template) => {
    // Replace placeholders
    let body = template.body;
    body = body.replace(/\{\{FIRST_NAME\}\}/g, leadName.split(" ")[0] || leadName);
    body = body.replace(/\{\{NAME\}\}/g, leadName);
    body = body.replace(/\{\{EMAIL\}\}/g, leadEmail);

    navigator.clipboard.writeText(body);
    setCopiedId(template.id);
    toast.success("Template copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUseTemplate = async (template: Template) => {
    // Replace placeholders
    let body = template.body;
    body = body.replace(/\{\{FIRST_NAME\}\}/g, leadName.split(" ")[0] || leadName);
    body = body.replace(/\{\{NAME\}\}/g, leadName);
    body = body.replace(/\{\{EMAIL\}\}/g, leadEmail);

    // Open email client or compose window
    const subject = template.subject || "Re: Your Roof Estimate Request";
    const mailtoLink = `mailto:${leadEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoLink;

    // Mark as replied after a short delay (user will send the email)
    setTimeout(async () => {
      try {
        await fetch("/api/hot-leads/mark-replied", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_id: leadId,
            message_id: null, // We don't have the original message_id here
          }),
        });
      } catch (error) {
        console.error("Error marking as replied:", error);
      }
    }, 1000);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>One-Click Reply Templates</CardTitle>
          <CardDescription>Loading templates...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          One-Click Reply Templates
        </CardTitle>
        <CardDescription>
          Click a template to open your email client with a pre-filled response
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No templates available. Contact support to add custom templates.
          </p>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="flex items-start justify-between gap-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1">
                <h4 className="font-medium text-sm mb-1">{template.title}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {template.body}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyTemplate(template)}
                >
                  {copiedId === template.id ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleUseTemplate(template)}
                >
                  Use Template
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}


























