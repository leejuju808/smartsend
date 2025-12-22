"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";

type Message = {
  id: string;
  from_address: string;
  contacts?: {
    email: string;
  };
  leads?: {
    email: string;
  };
};

type MessagingHubComposerProps = {
  message: Message;
  onSend: (subject: string, body: string) => Promise<void>;
};

export function MessagingHubComposer({
  message,
  onSend,
}: MessagingHubComposerProps) {
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);
  const [snippets, setSnippets] = useState<any[]>([]);
  const [showSnippets, setShowSnippets] = useState(false);

  // Load snippets
  useEffect(() => {
    loadSnippets();
  }, []);

  const loadSnippets = async () => {
    try {
      const res = await fetch("/api/messaging-hub/snippets");
      if (res.ok) {
        const data = await res.json();
        setSnippets(data.snippets || []);
      }
    } catch (error) {
      console.error("Failed to load snippets:", error);
    }
  };

  const handleSend = async () => {
    if (!body.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setLoading(true);
    try {
      await onSend(subject || `Re: ${message.from_address}`, body);
      setBody("");
      setSubject("");
    } catch (error) {
      toast.error("Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const insertSnippet = (snippetText: string) => {
    setBody((prev) => (prev ? `${prev}\n\n${snippetText}` : snippetText));
    setShowSnippets(false);
  };

  const generateAIDraft = async () => {
    try {
      const res = await fetch("/api/messaging-hub/ai-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: message.id,
          suggestion_types: ["short_reply"],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.suggestions && data.suggestions.length > 0) {
          setBody(data.suggestions[0].suggested_text);
          toast.success("AI draft generated");
        }
      }
    } catch (error) {
      toast.error("Failed to generate AI draft");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-2 border-b flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={generateAIDraft}
          className="text-xs"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          AI Draft
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSnippets(!showSnippets)}
          className="text-xs"
        >
          Snippets
        </Button>
      </div>

      {/* Snippets Panel */}
      {showSnippets && (
        <div className="border-b p-2 max-h-32 overflow-y-auto">
          <div className="text-xs font-medium text-gray-600 mb-1">
            Quick Snippets
          </div>
          <div className="flex flex-wrap gap-1">
            {snippets.slice(0, 5).map((snippet) => (
              <button
                key={snippet.id}
                onClick={() => insertSnippet(snippet.snippet_text)}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
              >
                {snippet.snippet_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="flex-1 flex flex-col p-4 space-y-2">
        <input
          type="text"
          placeholder="Subject (optional)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="text-sm px-3 py-2 border rounded-md"
        />
        <Textarea
          placeholder="Type your reply..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="flex-1 min-h-[120px] resize-none"
        />
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm">
            <Paperclip className="w-4 h-4" />
          </Button>
          <Button onClick={handleSend} disabled={loading || !body.trim()}>
            <Send className="w-4 h-4 mr-2" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}






































