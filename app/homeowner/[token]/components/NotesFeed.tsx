"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Calendar } from "lucide-react";

type Note = {
  id: string;
  content: string;
  note_type: string;
  created_at: string;
};

interface NotesFeedProps {
  notes: Note[];
}

export function NotesFeed({ notes }: NotesFeedProps) {
  if (notes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Daily Updates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {notes.map((note) => (
            <div
              key={note.id}
              className="border-l-4 border-blue-500 pl-4 py-2 space-y-1"
            >
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {note.content}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Calendar className="h-3 w-3" />
                <span>
                  {new Date(note.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}







































