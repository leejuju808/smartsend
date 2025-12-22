"use client";

import * as React from "react";
import { Mail, Reply, Zap, Snowflake, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TimelineEvent = {
  id: string;
  type: "initial_sent" | "follow_up_sent" | "inbound_reply" | "auto_reply_hot" | "auto_reply_warm" | "status_change";
  label: string;
  description?: string;
  stage?: string | null;
  timestamp: string;
};

type FollowUpProfile = {
  id: string;
  status: string;
  lead_intent: string;
  current_stage: string;
};

type Contact = {
  id: string;
  first_name: string | null;
  email: string;
  city: string | null;
};

type ContactTimelineResponse = {
  contact: Contact;
  profile: FollowUpProfile | null;
  events: TimelineEvent[];
};

type ContactFollowUpTimelineProps = {
  contactId: string;
};

export function ContactFollowUpTimeline({ contactId }: ContactFollowUpTimelineProps) {
  const [data, setData] = React.useState<ContactTimelineResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchTimeline = async () => {
      try {
        const res = await fetch(`/api/contacts/${contactId}/follow-up-timeline`);
        if (!res.ok) throw new Error("Failed to load timeline");
        const json = await res.json();
        setData(json.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchTimeline();
  }, [contactId]);

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Follow-Up Timeline</CardTitle>
          <CardDescription>Loading contact activity…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Follow-Up Timeline</CardTitle>
          <CardDescription>Could not load this contact.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { contact, profile, events } = data;

  const name = contact.first_name || contact.email;
  const city = contact.city || "";

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Follow-Up Timeline</CardTitle>
        <CardDescription>
          See every email, follow-up, and reply between SmartSend and {name}
          {city ? ` (${city})` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Profile status summary */}
        {profile ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Status:</span>
            <Badge variant="outline" className="capitalize">
              {profile.status.replace(/_/g, " ")}
            </Badge>
            <span className="text-muted-foreground ml-2">Intent:</span>
            <Badge className={cn("capitalize", getIntentBadgeClass(profile.lead_intent))}>
              {profile.lead_intent}
            </Badge>
            <span className="text-muted-foreground ml-2">Current stage:</span>
            <Badge variant="secondary" className="capitalize">
              {profile.current_stage || "none"}
            </Badge>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            No follow-up activity yet for this contact.
          </p>
        )}

        {/* Timeline */}
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-2">
            No emails or follow-ups recorded yet. Once this contact is part of a campaign,
            their full history will show up here.
          </p>
        ) : (
          <div className="relative mt-4 pl-3">
            {/* Vertical line */}
            <div className="absolute left-1.5 top-0 h-full w-px bg-border" />

            <ul className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="relative flex gap-3">
                  {/* Dot */}
                  <div className="mt-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background ring-2 ring-border">
                    {renderIcon(event.type)}
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">{event.label}</span>
                      {event.stage && (
                        <Badge variant="outline" className="h-4 rounded-sm px-1 text-[10px] capitalize">
                          {event.stage}
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {event.description}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground">
          This view shows how SmartSend has handled this homeowner for you — from the first
          email to every follow-up and reply — so you always know where the conversation stands.
        </p>
      </CardContent>
    </Card>
  );
}

function renderIcon(type: TimelineEvent["type"]) {
  const className = "h-2 w-2 text-muted-foreground";
  switch (type) {
    case "initial_sent":
      return <Mail className={className} />;
    case "follow_up_sent":
      return <Mail className={className} />;
    case "inbound_reply":
      return <Reply className={className} />;
    case "auto_reply_hot":
      return <Zap className={className} />;
    case "auto_reply_warm":
      return <Zap className={className} />;
    case "status_change":
      return <Snowflake className={className} />;
    default:
      return <Info className={className} />;
  }
}

function getIntentBadgeClass(intent: string) {
  switch (intent) {
    case "hot":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/40 dark:text-emerald-200";
    case "warm":
      return "bg-amber-500/10 text-amber-600 border-amber-500/40 dark:text-amber-200";
    case "not_interested":
      return "bg-slate-500/10 text-slate-600 border-slate-500/40 dark:text-slate-200";
    default:
      return "bg-muted text-foreground";
  }
}











































