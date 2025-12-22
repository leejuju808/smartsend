"use client";

// Block 19840 — AI Reply Assistant v1
// AI Reply Button Component

import { useState } from "react";
import { Sparkles, Loader2, Send, Edit2 } from "lucide-react";

interface AIReplyButtonProps {
  threadId?: string;
  leadId?: string;
  onReplyGenerated: (reply: string, replyType: string) => void;
  disabled?: boolean;
}

export default function AIReplyButton({
  threadId,
  leadId,
  onReplyGenerated,
  disabled = false,
}: AIReplyButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateReply = async () => {
    if (!threadId && !leadId) {
      setError("Thread ID or Lead ID is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/inbox/ai-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          thread_id: threadId,
          lead_id: leadId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate AI reply");
      }

      const data = await response.json();
      onReplyGenerated(data.reply, data.reply_type);
    } catch (err: any) {
      console.error("AI reply generation error:", err);
      setError(err.message || "Failed to generate reply");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleGenerateReply}
        disabled={disabled || loading}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
          transition-colors
          ${loading || disabled
            ? "bg-neutral-700 text-neutral-400 cursor-not-allowed"
            : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }
        `}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Generating AI Reply...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            <span>AI Reply</span>
          </>
        )}
      </button>
      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded">
          {error}
        </div>
      )}
    </div>
  );
}

// AI Reply Composer Component (shows generated reply with edit/send options)
export interface AIReplyComposerProps {
  generatedReply: string;
  replyType: string;
  onSend: (reply: string) => void;
  onEdit: (reply: string) => void;
  onCancel: () => void;
  sending?: boolean;
}

export function AIReplyComposer({
  generatedReply,
  replyType,
  onSend,
  onEdit,
  onCancel,
  sending = false,
}: AIReplyComposerProps) {
  const [editedReply, setEditedReply] = useState(generatedReply);
  const [isEditing, setIsEditing] = useState(false);

  const handleSend = () => {
    onSend(editedReply);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    onEdit(editedReply);
  };

  return (
    <div className="border border-emerald-500/30 rounded-xl p-4 bg-emerald-900/10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
            AI Suggested Reply
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-neutral-700 text-neutral-300">
            {replyType.replace('_', ' ')}
          </span>
        </div>
        {!isEditing && (
          <button
            onClick={handleEdit}
            className="text-xs text-neutral-400 hover:text-neutral-200 flex items-center gap-1"
          >
            <Edit2 className="w-3 h-3" />
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={editedReply}
            onChange={(e) => setEditedReply(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[120px]"
            rows={6}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-100 text-xs font-medium"
            >
              Save Changes
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditedReply(generatedReply);
              }}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="whitespace-pre-wrap text-neutral-100 text-sm bg-neutral-900 rounded-lg p-3 border border-neutral-800">
            {generatedReply}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              {sending ? "Sending..." : "Send"}
            </button>
            <button
              onClick={handleEdit}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-100 text-sm font-medium"
            >
              <Edit2 className="w-4 h-4" />
              Edit Then Send
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

