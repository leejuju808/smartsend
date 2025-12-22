"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MERGE_FIELDS = [
  { key: "{{first_name}}", label: "First Name", category: "lead" },
  { key: "{{last_name}}", label: "Last Name", category: "lead" },
  { key: "{{company}}", label: "Company", category: "lead" },
  { key: "{{email}}", label: "Email", category: "lead" },
  { key: "{{city}}", label: "City", category: "lead" },
  { key: "{{custom.field}}", label: "Custom Field", category: "custom", example: "{{custom.industry}}" },
  { key: "{{campaign.signature}}", label: "Campaign Signature", category: "campaign" },
];

interface MergeFieldSuggestionsProps {
  onInsert?: (field: string) => void;
  className?: string;
}

export function MergeFieldSuggestions({ onInsert, className }: MergeFieldSuggestionsProps) {
  const handleClick = (field: string) => {
    if (onInsert) {
      onInsert(field);
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(field);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-xs font-medium text-muted-foreground">Merge Fields</div>
      <div className="flex flex-wrap gap-1.5">
        {MERGE_FIELDS.map((field) => (
          <Button
            key={field.key}
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2 py-0 font-mono"
            onClick={() => handleClick(field.key)}
            title={field.label}
          >
            {field.key}
          </Button>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Click to copy • Use <code className="text-xs bg-muted px-1 rounded">custom.field_name</code> for custom fields
      </div>
    </div>
  );
}


