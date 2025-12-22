"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Zap, Calendar, DoorOpen } from "lucide-react";

interface CampaignSuggestionsProps {
  workspaceId: string;
}

export function CampaignSuggestions({ workspaceId }: CampaignSuggestionsProps) {
  const handleAction = async (actionType: string) => {
    // TODO: Implement campaign actions
    console.log("Action:", actionType, "for workspace:", workspaceId);
    // This would integrate with campaign creation API
  };

  const suggestions = [
    {
      id: "revival_campaign",
      icon: <Mail className="w-5 h-5" />,
      title: "Send Revival Campaign to Hot Zones",
      description: "Target neighborhoods with high engagement rates",
      action: "send_campaign",
      color: "bg-green-50 border-green-200 hover:bg-green-100",
    },
    {
      id: "storm_campaign",
      icon: <Zap className="w-5 h-5" />,
      title: "Run Storm Campaign for Affected Neighborhoods",
      description: "Reach out to areas with recent storm activity",
      action: "run_storm_campaign",
      color: "bg-blue-50 border-blue-200 hover:bg-blue-100",
    },
    {
      id: "book_inspections",
      icon: <Calendar className="w-5 h-5" />,
      title: "Book More Inspections in Top 3 Areas",
      description: "Focus on highest opportunity neighborhoods",
      action: "book_inspections",
      color: "bg-yellow-50 border-yellow-200 hover:bg-yellow-100",
    },
    {
      id: "door_knocking",
      icon: <DoorOpen className="w-5 h-5" />,
      title: "Print Door-Knocking Route",
      description: "Generate optimized route for high-value areas (Coming Soon)",
      action: "door_knock",
      color: "bg-purple-50 border-purple-200 hover:bg-purple-100",
      disabled: true,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign Suggestions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className={`p-4 rounded-lg border ${suggestion.color} transition-colors`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">{suggestion.icon}</div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-1">{suggestion.title}</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    {suggestion.description}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(suggestion.action)}
                    disabled={suggestion.disabled}
                  >
                    {suggestion.disabled ? "Coming Soon" : "Take Action"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}






































