"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailEditor } from "@/components/editor/EmailEditor";
import { EmailEditorToolbar } from "@/components/editor/EmailEditorToolbar";
import { VariablesPanel } from "@/components/editor/VariablesPanel";
import { PreviewEmail } from "@/components/editor/PreviewEmail";
import { TemplateRewriterPanel } from "@/components/templates/TemplateRewriterPanel";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import History from "@tiptap/extension-history";
import { VariablesExtension } from "@/components/editor/extensions/VariablesExtension";
import { SlashCommandExtension } from "@/components/editor/extensions/SlashCommandExtension";
import { SnippetsExtension } from "@/components/editor/extensions/SnippetsExtension";
import { Clock, History as HistoryIcon, Eye } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function EditTemplatePage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { data, error } = useSWR<{ template: any }>(
    `/api/templates/${params.id}`,
    fetcher
  );

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [html, setHtml] = useState("");
  const [shared, setShared] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [snippets, setSnippets] = useState<any[]>([]);
  const lastVersionTimeRef = useRef<Date | null>(null);

  // Load snippets
  useEffect(() => {
    async function loadSnippets() {
      try {
        const res = await fetch("/api/snippets/list");
        const data = await res.json();
        setSnippets(data.snippets || []);
      } catch (error) {
        console.error("Failed to load snippets:", error);
      }
    }
    loadSnippets();
  }, []);

  useEffect(() => {
    if (data?.template) {
      setName(data.template.name || "");
      setCategory(data.template.category || "");
      setSubject(data.template.subject || "");
      setHtml(data.template.html || data.template.body || "");
      setShared(data.template.shared !== false);
    }
  }, [data]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: "Write your email…" }),
      History,
      VariablesExtension.configure({
        suggestions: ['first_name', 'last_name', 'company', 'title', 'email', 'unsubscribe_link', 'booking_link'],
      }),
      SlashCommandExtension.configure({
        onCommand: async (command, selectedText) => {
          try {
            const res = await fetch(`/api/templates/${params.id}/rewrite-inline`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                command,
                selectedText,
                fullText: editor?.getText() || '',
              }),
            });
            const { result } = await res.json();
            return result || '';
          } catch (error) {
            console.error('Slash command error:', error);
            return '';
          }
        },
      }),
      SnippetsExtension.configure({
        snippets: snippets.map(s => ({ id: s.id, title: s.title, body: s.body, category: s.category })),
        onInsert: (snippet) => {
          editor?.chain().focus().insertContent(snippet.body).run();
        },
      }),
    ],
    content: html,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] px-4 py-3',
      },
    },
    onUpdate: ({ editor }) => {
      const newHtml = editor.getHTML();
      setHtml(newHtml);
      handleAutosave(newHtml);
    },
  });

  useEffect(() => {
    if (editor && html && editor.getHTML() !== html) {
      editor.commands.setContent(html);
    }
  }, [editor, html]);

  const handleAutosave = async (contentHtml: string) => {
    try {
      const res = await fetch(`/api/templates/${params.id}/autosave`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: contentHtml, subject }),
      });

      if (res.ok) {
        setLastSaved(new Date());
        setHtml(contentHtml);

        // Create version snapshot if >30s since last version
        const now = new Date();
        if (!lastVersionTimeRef.current || 
            (now.getTime() - lastVersionTimeRef.current.getTime()) > 30000) {
          try {
            await fetch(`/api/templates/${params.id}/versions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ html: contentHtml }),
            });
            lastVersionTimeRef.current = now;
          } catch (error) {
            console.error("Failed to create version:", error);
          }
        }
      }
    } catch (error) {
      console.error("Autosave error:", error);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !html.trim()) {
      alert("Name and body are required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${params.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category: category || null,
          body: html.trim(),
          html: html.trim(),
          subject: subject.trim(),
          shared,
        }),
      });

      if (res.ok) {
        setLastSaved(new Date());
        router.push("/templates");
      } else {
        const error = await res.json();
        alert(error.error || "Failed to update template");
      }
    } catch (error) {
      alert("Failed to update template");
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (variable: string) => {
    editor?.chain().focus().insertContent(`{{${variable}}}`).run();
  };

  const handleApplyAI = (newSubject: string, newBody: string) => {
    setSubject(newSubject);
    // TipTap will handle plain text conversion, but we'll get HTML back from editor
    editor?.commands.setContent(newBody);
    // Update html state from editor after content is set
    setTimeout(() => {
      const updatedHtml = editor?.getHTML() || newBody;
      setHtml(updatedHtml);
    }, 0);
  };

  const handleApplyVariant = (text: string) => {
    // Convert plain text to HTML paragraphs for TipTap
    const htmlContent = text
      .split('\n\n')
      .map(para => para.trim())
      .filter(Boolean)
      .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('');
    
    editor?.commands.setContent(htmlContent || text);
    setTimeout(() => {
      const updatedHtml = editor?.getHTML() || htmlContent || text;
      setHtml(updatedHtml);
    }, 0);
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-red-500">Failed to load template</div>
      </div>
    );
  }

  if (!data?.template) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div>Loading...</div>
      </div>
    );
  }

  const formatTimeAgo = (date: Date | null) => {
    if (!date) return "Never";
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hours ago`;
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Template</h1>
        <div className="flex items-center gap-2">
          {lastSaved && (
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Last saved: {formatTimeAgo(lastSaved)}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setVersionsOpen(true)}>
            <HistoryIcon className="h-4 w-4 mr-2" />
            Version History
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4 mr-2" />
            Preview Email
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Editor Area */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Template Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Cold Email A - Value Prop"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="{{company}} <> Quick question"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category (optional)</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Outreach, Follow-Ups, Objections"
                />
              </div>

              <div className="space-y-2">
                <Label>Email Body</Label>
                <div className="border rounded-lg overflow-hidden">
                  <EmailEditorToolbar 
                    editor={editor} 
                    onInsertVariable={insertVariable}
                    onInsertSnippet={() => {
                      // TODO: Open snippet selector
                    }}
                  />
                  <EmailEditor editor={editor} />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="shared"
                  checked={shared}
                  onCheckedChange={setShared}
                />
                <Label htmlFor="shared">Shared with team</Label>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push("/templates")}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Variables</CardTitle>
            </CardHeader>
            <CardContent>
              <VariablesPanel onInsert={insertVariable} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Snippets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {snippets.length > 0 ? (
                  snippets.map((snippet) => (
                    <Button
                      key={snippet.id}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        editor?.chain().focus().insertContent(snippet.body).run();
                      }}
                    >
                      {snippet.title}
                    </Button>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">No snippets available</p>
                )}
              </div>
            </CardContent>
          </Card>

          <TemplateRewriterPanel
            templateId={params.id}
            onApplyVariant={handleApplyVariant}
          />
        </div>
      </div>

      {/* Preview Modal */}
      <PreviewEmail
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        html={html}
        subject={subject}
      />

      {/* Version History Modal */}
      {versionsOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Version History</h2>
              <Button variant="ghost" onClick={() => setVersionsOpen(false)}>Close</Button>
            </div>
            <VersionHistoryList templateId={params.id} onRestore={(html) => {
              setHtml(html);
              editor?.commands.setContent(html);
              setVersionsOpen(false);
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

function VersionHistoryList({ templateId, onRestore }: { templateId: string; onRestore: (html: string) => void }) {
  const { data } = useSWR(`/api/templates/${templateId}/versions`, fetcher);

  if (!data?.versions) {
    return <div>Loading versions...</div>;
  }

  return (
    <div className="space-y-2">
      {data.versions.map((version: any) => (
        <div key={version.id} className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500">
              {new Date(version.created_at).toLocaleString()}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRestore(version.html)}
            >
              Restore
            </Button>
          </div>
          <div
            className="text-sm prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: version.html.substring(0, 200) + '...' }}
          />
        </div>
      ))}
    </div>
  );
}
