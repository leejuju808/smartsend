"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { OutboundChannel } from "./OutboundModal";

interface OutreachPack {
  id: string;
  name: string;
  description: string;
  angles: {
    id: string;
    name: string;
    message: string;
    subject?: string;
  }[];
}

const OUTREACH_PACKS: OutreachPack[] = [
  {
    id: "old_lead_reactivation",
    name: "Old Lead Re-Activation Pack",
    description: "Re-engage leads that went cold",
    angles: [
      {
        id: "still_need_help",
        name: "Still Need Help?",
        message: "Hey {{first_name}}, just checking in - still need roof help? We're in your area this week and can swing by for a free inspection.",
      },
      {
        id: "in_area_this_week",
        name: "In Your Area",
        message: "{{first_name}}, we're in your area this week doing roof work. Want us to take a quick look at yours? Free inspection.",
      },
      {
        id: "free_inspection_past_quotes",
        name: "Free Inspection for Past Quotes",
        message: "Hey {{first_name}}, we're offering free inspections for anyone we've quoted before. Want us to come check things out?",
      },
    ],
  },
  {
    id: "storm_event",
    name: "Storm Event Pack",
    description: "Reach out after storms or hail",
    angles: [
      {
        id: "hail_check",
        name: "Hail in Your Area",
        message: "{{first_name}}, there was hail in your area recently. Want us to come check your roof for damage? Free inspection.",
      },
      {
        id: "wind_damage",
        name: "Wind Damage Check",
        message: "Hey {{first_name}}, with the recent wind, there might be damage to your roof. Want us to swing by and check? Free inspection.",
      },
    ],
  },
  {
    id: "insurance_claim",
    name: "Insurance Claim Pack",
    description: "Help with insurance claims",
    angles: [
      {
        id: "claim_assistance",
        name: "Claim Assistance",
        message: "{{first_name}}, we help homeowners navigate insurance claims. Want assistance with yours?",
      },
      {
        id: "meet_adjuster",
        name: "Meet Your Adjuster",
        message: "Hey {{first_name}}, we can meet your adjuster with you to make sure you get a fair assessment. Interested?",
      },
    ],
  },
  {
    id: "annual_maintenance",
    name: "Annual Maintenance Pack",
    description: "Seasonal maintenance reminders",
    angles: [
      {
        id: "one_year_tuneup",
        name: "One-Year Tune-Up",
        message: "{{first_name}}, it's been about a year since we worked on your roof. Want us to come check for loose shingles or leaks?",
      },
      {
        id: "seasonal_check",
        name: "Seasonal Check",
        message: "Hey {{first_name}}, with the weather changing, it's a good time to check your roof. Want us to take a look?",
      },
    ],
  },
  {
    id: "quote_not_closed",
    name: "Reactivation: Quote Not Closed",
    description: "Follow up on quotes that didn't close",
    angles: [
      {
        id: "still_want_repair",
        name: "Still Want the Repair?",
        message: "{{first_name}}, just touching base - still want the repair? We can schedule it this week.",
      },
      {
        id: "discount_this_week",
        name: "10% Off This Week",
        message: "Hey {{first_name}}, we can do 10% off this week up to 3 jobs. Want to lock in your spot?",
      },
    ],
  },
  {
    id: "past_customer",
    name: "Past Customer Pack",
    description: "Stay in touch with past customers",
    angles: [
      {
        id: "everything_holding_up",
        name: "Everything Holding Up?",
        message: "Hey {{first_name}}, hope everything is holding up well. Need anything?",
      },
      {
        id: "seasonal_maintenance",
        name: "Seasonal Maintenance",
        message: "{{first_name}}, just a reminder - seasonal maintenance can catch small issues before they become big ones. Want us to check?",
      },
    ],
  },
  {
    id: "referral_request",
    name: "Referral Request Pack",
    description: "Ask for referrals",
    angles: [
      {
        id: "anyone_else_on_street",
        name: "Anyone Else on Your Street?",
        message: "Hey {{first_name}}, anyone else on your street need roof work? We appreciate referrals.",
      },
      {
        id: "appreciate_referrals",
        name: "We Appreciate Referrals",
        message: "{{first_name}}, if you know anyone who needs roof work, we'd love to help. Thanks for thinking of us!",
      },
    ],
  },
];

interface AIOutreachPacksProps {
  channel: OutboundChannel;
  onSelectPack: (packId: string, angleId: string, message: string, subject?: string) => void;
}

export function AIOutreachPacks({ channel, onSelectPack }: AIOutreachPacksProps) {
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null);

  const togglePack = (packId: string) => {
    setExpandedPackId(expandedPackId === packId ? null : packId);
  };

  const handleSelectAngle = (pack: OutreachPack, angle: OutreachPack["angles"][0]) => {
    // Replace placeholders with actual values (in real implementation, would use contact data)
    let message = angle.message;
    message = message.replace(/\{\{first_name\}\}/g, "there");

    onSelectPack(pack.id, angle.id, message, angle.subject);
    setExpandedPackId(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium">AI Outreach Packs</Label>
      </div>
      <div className="border rounded-lg divide-y">
        {OUTREACH_PACKS.map((pack) => (
          <div key={pack.id}>
            <button
              type="button"
              onClick={() => togglePack(pack.id)}
              className="w-full flex items-center justify-between p-3 hover:bg-accent transition-colors"
            >
              <div className="text-left">
                <div className="font-medium text-sm">{pack.name}</div>
                <div className="text-xs text-muted-foreground">{pack.description}</div>
              </div>
              {expandedPackId === pack.id ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedPackId === pack.id && (
              <div className="p-3 pt-0 space-y-2 bg-accent/50">
                {pack.angles.map((angle) => (
                  <Button
                    key={angle.id}
                    variant="outline"
                    size="sm"
                    className="w-full text-left justify-start"
                    onClick={() => handleSelectAngle(pack, angle)}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-xs">{angle.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {angle.message.replace(/\{\{first_name\}\}/g, "there")}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Import Label component
import { Label } from "@/components/ui/label";

