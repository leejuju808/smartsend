"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Preset = {
  name: string;
  subject: string;
  body: string;
};

const ROOFING_PRESETS: Preset[] = [
  {
    name: "Hail Damage Intro",
    subject: "Free roof inspection in {city}",
    body: "Hi {first_name}, I noticed your area in {city} had recent hail activity. Many homeowners are seeing shingle bruising or granule loss. We're doing free inspections this week—want me to take a look at your roof?",
  },
  {
    name: "Inspection Offer",
    subject: "Free roof inspection - {city}",
    body: "Hi {first_name}, we're offering free roof inspections in {city} this week. No obligation, just want to help homeowners understand their roof's condition. Are you available for a quick 30-minute inspection?",
  },
  {
    name: "Insurance Claim Helper",
    subject: "Insurance may cover your roof repairs",
    body: "Hi {first_name}, many homeowners don't realize their insurance covers roof repairs from storm damage. I can help you navigate the claims process—no cost to you. Want to schedule a free inspection to see if you qualify?",
  },
  {
    name: "Roof Replacement CTA",
    subject: "Time to replace your roof?",
    body: "Hi {first_name}, roof issues only get worse with time. If your roof is showing signs of wear or storm damage, now's the time to address it before it becomes a bigger problem. Available this week for a free inspection?",
  },
  {
    name: "Follow-Up Reminder #1",
    subject: "Following up on your roof",
    body: "Hi {first_name}, following up on the roof inspection we discussed. Have you had a chance to review your options? I'm here to help answer any questions. Want to schedule a call?",
  },
];

interface RoofingPresetsProps {
  onLoadPreset: (preset: Preset) => void;
}

export function RoofingPresets({ onLoadPreset }: RoofingPresetsProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Load Preset</div>
      <div className="flex flex-wrap gap-2">
        {ROOFING_PRESETS.map((preset) => (
          <Button
            key={preset.name}
            variant="outline"
            size="sm"
            onClick={() => onLoadPreset(preset)}
          >
            {preset.name}
          </Button>
        ))}
      </div>
    </div>
  );
}




























































