"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "../../../../components/useToast";

export default function FollowUpGenerator() {
  const [replyId, setReplyId] = useState("");
  const [draft, setDraft] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [recentReplies, setRecentReplies] = useState<any[]>([]);
  const { notify } = useToast();

  useEffect(() => {
    // For now, use a placeholder workspace ID
    // In production, this should come from user context or auth
    setWorkspaceId("default-workspace-id");
    
    // Load recent replies for easier selection
    loadRecentReplies();
  }, []);

  async function loadRecentReplies() {
    try {
      const res = await fetch("/api/replies/recent");
      if (res.ok) {
        const data = await res.json();
        setRecentReplies(data.replies || []);
      }
    } catch (error) {
      console.error("Failed to load recent replies:", error);
    }
  }

  async function generate() {
    if (!workspaceId) {
      notify("Workspace ID not found. Please refresh the page.");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch("/api/followup/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply_id: replyId, workspace_id: workspaceId }),
      });
      const data = await res.json();
      if (data.ok) {
        setDraft(data.draft);
        notify("Follow-up draft generated successfully!");
      } else {
        notify(`Error: ${data.error}`);
      }
    } catch (error) {
      notify("Failed to generate follow-up draft");
    }
    setLoading(false);
  }

  async function sendDraft() {
    if (!draft) return;
    
    setSending(true);
    try {
      const res = await fetch("/api/followup/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id }),
      });
      const data = await res.json();
      if (data.ok) {
        notify("Follow-up email sent successfully!");
        setDraft(null);
        setReplyId("");
      } else {
        notify(`Error: ${data.error}`);
      }
    } catch (error) {
      notify("Failed to send follow-up email");
    }
    setSending(false);
  }

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <h3 className="text-lg font-semibold">🤖 Smart Follow-Up Generator</h3>
      
      {/* Recent Replies Selection */}
      {recentReplies.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">Recent Replies:</h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {recentReplies.slice(0, 5).map((reply) => (
              <div 
                key={reply.id}
                className="p-2 border rounded cursor-pointer hover:bg-gray-800 text-sm"
                onClick={() => setReplyId(reply.id)}
              >
                <div className="font-medium">{reply.from_email}</div>
                <div className="text-gray-400 truncate">{reply.body?.substring(0, 50)}...</div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <Input
        placeholder="Enter Reply ID to generate follow-up"
        value={replyId}
        onChange={e=>setReplyId(e.target.value)}
      />
      <Button onClick={generate} disabled={loading || !replyId} className="bg-yellow-500 text-black">
        {loading ? "Generating..." : "Generate Draft"}
      </Button>

      {draft && (
        <div className="border-t pt-3 text-sm space-y-2">
          <h4 className="font-semibold">Suggested Subject:</h4>
          <p className="italic">{draft.draft_subject}</p>
          <h4 className="font-semibold">Body:</h4>
          <Textarea readOnly rows={8} value={draft.draft_body} />
          <div className="flex gap-2 pt-2">
            <Button 
              onClick={sendDraft} 
              disabled={sending}
              className="bg-green-500 text-white hover:bg-green-600"
            >
              {sending ? "Sending..." : "Send Follow-Up"}
            </Button>
            <Button 
              onClick={() => setDraft(null)}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}