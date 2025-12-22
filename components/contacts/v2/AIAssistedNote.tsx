// Block 16500 — AI-Assisted Note Writing
"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/Button";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AIAssistedNoteProps {
  contactId: string;
  onNoteAdded?: () => void;
}

export function AIAssistedNote({ contactId, onNoteAdded }: AIAssistedNoteProps) {
  const [note, setNote] = useState("");
  const [expandedNote, setExpandedNote] = useState("");
  const [isExpanding, setIsExpanding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleNoteChange = async (value: string) => {
    setNote(value);
    
    // Auto-expand if note is short (less than 50 chars) and user stops typing for 1 second
    if (value.length > 10 && value.length < 50) {
      const timeoutId = setTimeout(async () => {
        setIsExpanding(true);
        try {
          // Call AI expansion API
          const res = await fetch(`/api/contacts/${contactId}/expand-note`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note: value }),
          });
          const data = await res.json();
          if (data.expanded) {
            setExpandedNote(data.expanded);
          }
        } catch (error) {
          console.error("Failed to expand note:", error);
        } finally {
          setIsExpanding(false);
        }
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    } else {
      setExpandedNote("");
    }
  };

  const handleSaveNote = async () => {
    const finalNote = expandedNote || note;
    if (!finalNote.trim()) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: finalNote,
          auto_expanded: !!expandedNote,
        }),
      });

      if (res.ok) {
        setNote("");
        setExpandedNote("");
        onNoteAdded?.();
      }
    } catch (error) {
      console.error("Failed to save note:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const useExpanded = () => {
    setNote(expandedNote);
    setExpandedNote("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium">AI-Assisted Note Writing</span>
        {expandedNote && (
          <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
            AI Expanded
          </Badge>
        )}
      </div>
      
      <div className="space-y-2">
        <Textarea
          placeholder="Type a short note... AI will expand it automatically"
          value={note}
          onChange={(e) => handleNoteChange(e.target.value)}
          rows={3}
          className="resize-none"
        />
        
        {isExpanding && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>AI is expanding your note...</span>
          </div>
        )}
        
        {expandedNote && expandedNote !== note && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-green-700">AI Expanded Note:</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={useExpanded}
                className="h-6 text-xs"
              >
                Use This
              </Button>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{expandedNote}</p>
          </div>
        )}
        
        <div className="flex justify-end">
          <Button
            onClick={handleSaveNote}
            disabled={!note.trim() || isSaving}
            size="sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Save Note
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}





















































