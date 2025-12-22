"use client";

// Briefing Notes List Component
// Displays warning/note messages

interface BriefingNotesListProps {
  notes: string[];
}

export function BriefingNotesList({ notes }: BriefingNotesListProps) {
  if (notes.length === 0) return null;

  return (
    <div className="space-y-1">
      {notes.map((note, idx) => (
        <div
          key={idx}
          className="text-xs text-yellow-400 bg-yellow-600/10 border border-yellow-600/20 rounded px-2 py-1"
        >
          {note}
        </div>
      ))}
    </div>
  );
}







































