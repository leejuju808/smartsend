++ 0
"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CalendarSettings() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Calendar</h2>
      <p className="text-sm text-muted-foreground">
        Connect Google or Outlook to auto-create draft events. Otherwise, download the .ics file and add it manually.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline">Connect Google</Button>
        <Button variant="outline">Connect Outlook</Button>
      </div>
      <div className="max-w-xs space-y-1">
        <label className="text-sm font-medium text-muted-foreground">Default provider</label>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="google">Google</SelectItem>
            <SelectItem value="outlook">Outlook</SelectItem>
            <SelectItem value="none">None (ICS only)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}


