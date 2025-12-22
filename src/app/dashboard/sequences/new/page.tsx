"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/Button";

interface EmailTemplate {
  id: string;
  title: string;
  body: string;
  category: string;
  intent: string;
}

export default function NewSequencePage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("templateId");
  const rewrittenText = searchParams.get("rewritten");

  const [name, setName] = useState("New Sequence");
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  useEffect(() => {
    if (templateId) {
      loadTemplate();
    } else {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (rewrittenText) {
      // Use rewritten text if provided
      setBody(decodeURIComponent(rewrittenText));
    } else if (template) {
      // Use template body
      setBody(template.body);
      // Try to extract a subject from the template title or create one
      setSubject(template.title || "Quick question for {{firstName}}");
    }
  }, [template, rewrittenText]);

  async function loadTemplate() {
    if (!templateId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (error) throw error;
      setTemplate(data);
      setBody(data?.body || "");
      setSubject(data?.title || "Quick question for {{firstName}}");
    } catch (error) {
      console.error("Error loading template:", error);
      alert("Failed to load template");
    } finally {
      setLoading(false);
    }
  }

  async function createSequence() {
    if (!name.trim()) {
      alert("Please enter a sequence name");
      return;
    }

    if (!subject.trim() || !body.trim()) {
      alert("Please enter both subject and body");
      return;
    }

    try {
      // Get active workspace
      const activeWorkspace = localStorage.getItem("active_workspace");
      if (!activeWorkspace) {
        alert("No active workspace selected");
        return;
      }

      // Create a simple sequence with one step
      // First, we need to create or find a campaign, or create a standalone sequence
      // Based on the codebase structure, sequences seem to be tied to campaigns
      // Let's create a minimal sequence step structure

      const response = await fetch("/api/sequences/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          steps: [
            {
              step_number: 1,
              wait_days: 0,
              subject_template: subject,
              body_md: body,
            },
          ],
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to create sequence");
      }

      // Redirect to the sequence editor or sequences list
      const sequenceId = result.sequence_id || result.id || result.sequenceId;
      if (sequenceId) {
        router.push(`/sequences/${sequenceId}`);
      } else {
        router.push("/dashboard/sequences");
      }
    } catch (error: any) {
      console.error("Error creating sequence:", error);
      alert(error.message || "Failed to create sequence");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading template...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Create New Sequence</h1>
        {template && (
          <p className="text-muted-foreground mt-2">
            Using template: <strong>{template.title}</strong> ({template.category} • {template.intent})
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Sequence Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded-xl px-4 py-2 w-full"
            placeholder="My Email Sequence"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Subject Line</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="border rounded-xl px-4 py-2 w-full"
            placeholder="Quick question for {{firstName}}"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use variables like {"{{firstName}}"}, {"{{company}}"}, etc.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Email Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="border rounded-xl px-4 py-2 w-full min-h-[300px] font-mono text-sm"
            placeholder="Your email body here..."
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use variables like {"{{firstName}}"}, {"{{company}}"}, etc.
          </p>
        </div>

        <div className="flex gap-3">
          <Button onClick={createSequence} size="lg">
            Create Sequence
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/templates")}
          >
            Browse More Templates
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

