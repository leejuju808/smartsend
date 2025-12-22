"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Save } from "lucide-react";

interface JobNotesPanelProps {
  jobId: string;
  notes: string;
  onNotesChange: (notes: string) => void;
  onSave: () => void;
}

export function JobNotesPanel({ notes, onNotesChange, onSave }: JobNotesPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Internal Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Add notes about this job..."
          className="w-full px-3 py-2 border rounded-md text-sm min-h-[200px]"
        />
        <Button onClick={onSave} size="sm">
          <Save className="h-4 w-4 mr-2" />
          Save Notes
        </Button>
      </CardContent>
    </Card>
  );
}


































