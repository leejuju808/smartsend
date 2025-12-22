// Block 13300 — Lead Info Panel Component (Right Column)

"use client";

import { useState } from "react";
import { MapPin, Tag, DollarSign, User, Calendar, FileText, CheckSquare, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Lead = {
  id: string;
  name: string;
  email: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  state?: string;
  status: string;
  estimated_value?: number;
};

type Note = {
  id: string;
  body: string;
  created_at: string;
  author_user_id?: string;
};

type Task = {
  id: string;
  title: string;
  notes?: string;
  status: string;
  due_at?: string;
  completed: boolean;
};

type LeadInfoPanelProps = {
  lead: Lead | null;
  campaign: { id: string; name: string } | null;
  notes: Note[];
  tasks: Task[];
  onAddNote: (body: string) => Promise<void>;
  onUpdateStatus: (status: string) => Promise<void>;
};

const STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "HOT", label: "HOT" },
  { value: "WARM", label: "Warm" },
  { value: "FOLLOW_UP", label: "Follow Up" },
  { value: "NOT_INTERESTED", label: "Not Interested" },
];

export function LeadInfoPanel({
  lead,
  campaign,
  notes,
  tasks,
  onAddNote,
  onUpdateStatus,
}: LeadInfoPanelProps) {
  const [newNote, setNewNote] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  if (!lead) {
    return (
      <div className="w-80 border-l bg-gray-50 p-4 flex items-center justify-center">
        <p className="text-sm text-gray-500">Select a thread to view lead info</p>
      </div>
    );
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsAddingNote(true);
    try {
      await onAddNote(newNote);
      setNewNote("");
    } catch (error) {
      console.error("Failed to add note:", error);
    } finally {
      setIsAddingNote(false);
    }
  };

  return (
    <div className="w-80 border-l bg-white flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg mb-1">{lead.name}</h2>
        <p className="text-sm text-gray-600">{lead.email}</p>
      </div>

      {/* Homeowner Details */}
      <div className="p-4 border-b space-y-3">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <User className="w-4 h-4" />
          Homeowner Details
        </h3>

        {(lead.city || lead.state) && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4" />
            <span>
              {[lead.city, lead.state].filter(Boolean).join(", ") || "No location"}
            </span>
          </div>
        )}

        {lead.estimated_value && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <DollarSign className="w-4 h-4" />
            <span>${lead.estimated_value.toLocaleString()}</span>
          </div>
        )}

        {campaign && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Tag className="w-4 h-4" />
            <span>{campaign.name}</span>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="p-4 border-b">
        <label className="block text-sm font-medium mb-2">Status</label>
        <select
          value={lead.status}
          onChange={(e) => onUpdateStatus(e.target.value)}
          className="w-full px-3 py-2 border rounded-md text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Notes Section */}
      <div className="p-4 border-b flex-1 flex flex-col min-h-0">
        <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Notes
        </h3>

        <div className="flex-1 overflow-y-auto space-y-2 mb-3">
          {notes.length === 0 ? (
            <p className="text-sm text-gray-500">No notes yet</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="p-2 bg-gray-50 rounded text-sm">
                <p className="whitespace-pre-wrap">{note.body}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(note.created_at).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <Textarea
            placeholder="Add a note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
            className="text-sm"
          />
          <Button
            onClick={handleAddNote}
            disabled={!newNote.trim() || isAddingNote}
            size="sm"
            className="w-full"
          >
            Add Note
          </Button>
        </div>
      </div>

      {/* Tasks Section */}
      <div className="p-4 border-b">
        <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
          <CheckSquare className="w-4 h-4" />
          Tasks
        </h3>

        <div className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-500">No tasks</p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className={`p-2 rounded text-sm border ${
                  task.completed ? "bg-gray-50 opacity-60" : "bg-white"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className={task.completed ? "line-through" : ""}>
                      {task.title}
                    </p>
                    {task.due_at && (
                      <p className="text-xs text-gray-500 mt-1">
                        Due: {new Date(task.due_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {task.completed && (
                    <span className="text-green-600">✓</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Timeline Button */}
      <div className="p-4 border-t">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            // Navigate to timeline page
            window.location.href = `/leads/${lead.id}/timeline`;
          }}
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          View Timeline
        </Button>
      </div>
    </div>
  );
}





















































