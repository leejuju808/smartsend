"use client";

import { ContactTimelineEvent } from "@/lib/types/contact";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  MailInbox,
  StickyNote,
  CheckCircle2,
  Circle,
  Tag,
  ArrowRight,
  Loader2,
  Flame,
  Clock,
  Settings,
  Repeat,
  BarChart3,
  ExternalLink,
  MessageSquare,
  TrendingUp,
  FolderOpen,
  Globe,
  Ban,
  CloudLightning,
  Calendar,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { AddNoteModal } from "./AddNoteModal";
import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Date formatting helpers
const isToday = (date: Date): boolean => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

const isYesterday = (date: Date): boolean => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
};

const formatDate = (date: Date, formatStr: string): string => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (formatStr === "MMM d, yyyy") {
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }
  if (formatStr === "h:mm a") {
    const hours = date.getHours() % 12 || 12;
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const ampm = date.getHours() >= 12 ? "PM" : "AM";
    return `${hours}:${minutes} ${ampm}`;
  }
  return date.toLocaleDateString();
};

interface ContactTimelineProps {
  events: ContactTimelineEvent[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  contactId: string;
  onNoteAdded: () => void;
  onFilterChange?: (types: string[], dateFilter?: string) => void;
}

const EVENT_FILTERS = [
  { value: "all", label: "All" },
  { value: "email_sent", label: "Emails" },
  { value: "reply_received", label: "Replies" },
  { value: "task_created", label: "Tasks" },
  { value: "tag_added", label: "Tags" },
  { value: "score_changed", label: "Score" },
  { value: "pipeline_moved", label: "Pipeline" },
  { value: "note", label: "Notes" },
] as const;

const DATE_FILTERS = [
  { value: "all", label: "All-time" },
  { value: "week", label: "This week" },
  { value: "month", label: "Last month" },
  { value: "year", label: "This year" },
] as const;

// Block 14200 — Timeline v2 Icons
const eventIcons: Record<string, React.ReactNode> = {
  // Core event types
  email_sent: <Mail className="h-4 w-4" />, // 📤
  reply_received: <MailInbox className="h-4 w-4" />, // 📥
  task_created: <Circle className="h-4 w-4" />, // 🔔
  task_completed: <CheckCircle2 className="h-4 w-4" />, // ✔️
  status_changed: <Tag className="h-4 w-4" />, // 🏷️
  score_changed: <Flame className="h-4 w-4" />, // 🔥
  tag_added: <Tag className="h-4 w-4" />, // 🏷️
  tag_removed: <Tag className="h-4 w-4" />, // 🏷️
  pipeline_moved: <FolderOpen className="h-4 w-4" />, // 🗂️
  enrichment_added: <Globe className="h-4 w-4" />, // 🌐
  suppressed: <Ban className="h-4 w-4" />, // ⛔
  campaign_step: <Mail className="h-4 w-4" />, // 📧
  note: <StickyNote className="h-4 w-4" />, // 📝
  storm_event: <CloudLightning className="h-4 w-4" />, // 🌩️
  // Legacy support
  email_opened: <Mail className="h-4 w-4" />,
  email_replied: <MailInbox className="h-4 w-4" />,
  email_reply: <MailInbox className="h-4 w-4" />,
  intent_detected: <Flame className="h-4 w-4" />,
  intent_changed: <Flame className="h-4 w-4" />,
  pipeline_stage_changed: <FolderOpen className="h-4 w-4" />,
  lead_status_changed: <ArrowRight className="h-4 w-4" />,
  status_change: <ArrowRight className="h-4 w-4" />,
  tag_change: <Tag className="h-4 w-4" />,
  task_assigned: <Clock className="h-4 w-4" />,
  note_added: <StickyNote className="h-4 w-4" />,
  ai_opener_generated: <Settings className="h-4 w-4" />,
  campaign_assigned: <BarChart3 className="h-4 w-4" />,
  campaign_enrolled: <BarChart3 className="h-4 w-4" />,
  campaign_unenrolled: <BarChart3 className="h-4 w-4" />,
  list_imported: <Repeat className="h-4 w-4" />,
  profile_updated: <Settings className="h-4 w-4" />,
  sequence_step_sent: <Mail className="h-4 w-4" />,
  auto_followup_fired: <Settings className="h-4 w-4" />,
  contact_merged: <Repeat className="h-4 w-4" />,
  pipeline_update: <FolderOpen className="h-4 w-4" />,
};

// Block 14200 — Timeline v2 Colors
const eventColors: Record<string, string> = {
  // Core event types
  email_sent: "bg-blue-500",
  reply_received: "bg-green-500",
  task_created: "bg-purple-500",
  task_completed: "bg-green-600",
  status_changed: "bg-gray-500",
  score_changed: "bg-orange-500",
  tag_added: "bg-indigo-500",
  tag_removed: "bg-indigo-400",
  pipeline_moved: "bg-purple-600",
  enrichment_added: "bg-teal-500",
  suppressed: "bg-red-500",
  campaign_step: "bg-blue-400",
  note: "bg-yellow-500",
  storm_event: "bg-slate-600",
  // Legacy support
  email_opened: "bg-blue-400",
  email_replied: "bg-green-500",
  email_reply: "bg-green-500",
  intent_detected: "bg-orange-500",
  intent_changed: "bg-orange-500",
  pipeline_stage_changed: "bg-purple-600",
  lead_status_changed: "bg-gray-500",
  status_change: "bg-gray-500",
  tag_change: "bg-indigo-500",
  task_assigned: "bg-purple-400",
  note_added: "bg-yellow-500",
  ai_opener_generated: "bg-indigo-500",
  campaign_assigned: "bg-teal-500",
  campaign_enrolled: "bg-teal-500",
  campaign_unenrolled: "bg-teal-400",
  list_imported: "bg-pink-500",
  profile_updated: "bg-gray-400",
  sequence_step_sent: "bg-blue-400",
  auto_followup_fired: "bg-gray-400",
  contact_merged: "bg-pink-500",
  pipeline_update: "bg-purple-600",
};

// Event grouping helper
interface GroupedEvent {
  id: string;
  type: string;
  count: number;
  events: ContactTimelineEvent[];
  firstEvent: ContactTimelineEvent;
  isExpanded: boolean;
}

function groupSimilarEvents(events: ContactTimelineEvent[]): (ContactTimelineEvent | GroupedEvent)[] {
  const grouped: (ContactTimelineEvent | GroupedEvent)[] = [];
  const groups: Map<string, ContactTimelineEvent[]> = new Map();
  
  // Group consecutive similar events (e.g., multiple emails from same campaign)
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const nextEvent = events[i + 1];
    
    // Check if this and next event should be grouped (same type, same campaign, within 1 hour)
    if (
      nextEvent &&
      event.type === nextEvent.type &&
      event.type === "email_sent" &&
      event.meta?.campaign_id === nextEvent.meta?.campaign_id
    ) {
      const groupKey = `${event.type}-${event.meta?.campaign_id || "default"}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, [event]);
      }
      groups.get(groupKey)!.push(nextEvent);
      i++; // Skip next event as it's grouped
    } else {
      // Check if current event is part of a group
      let added = false;
      for (const [key, groupEvents] of groups.entries()) {
        if (groupEvents.includes(event)) {
          added = true;
          break;
        }
      }
      if (!added) {
        grouped.push(event);
      }
    }
  }
  
  // Add grouped events
  for (const [key, groupEvents] of groups.entries()) {
    if (groupEvents.length > 2) {
      grouped.push({
        id: `group-${key}`,
        type: groupEvents[0].type,
        count: groupEvents.length,
        events: groupEvents,
        firstEvent: groupEvents[0],
        isExpanded: false,
      });
    } else {
      // If only 2 events, don't group
      grouped.push(...groupEvents);
    }
  }
  
  // Sort grouped events by first event's date
  grouped.sort((a, b) => {
    const dateA = new Date(
      ("firstEvent" in a ? a.firstEvent : a).createdAt || 
      ("firstEvent" in a ? a.firstEvent : a).occurred_at || 
      ""
    ).getTime();
    const dateB = new Date(
      ("firstEvent" in b ? b.firstEvent : b).createdAt || 
      ("firstEvent" in b ? b.firstEvent : b).occurred_at || 
      ""
    ).getTime();
    return dateB - dateA;
  });
  
  return grouped;
}

export function ContactTimeline({
  events,
  loading,
  hasMore,
  onLoadMore,
  contactId,
  onNoteAdded,
  onFilterChange,
}: ContactTimelineProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>(() => {
    const eventParam = searchParams.get("event");
    return eventParam ? [] : ["all"]; // If event param exists, show all to find it
  });
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<ContactTimelineEvent | null>(null);
  const eventRefs = useRef<Record<string, HTMLDivElement>>({});
  const highlightedEventId = searchParams.get("event");

  // Handle deep linking - scroll to event when component mounts or event changes
  useEffect(() => {
    if (highlightedEventId && eventRefs.current[highlightedEventId]) {
      setTimeout(() => {
        eventRefs.current[highlightedEventId]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        // Add highlight class temporarily
        eventRefs.current[highlightedEventId]?.classList.add("ring-2", "ring-blue-500", "ring-offset-2");
        setTimeout(() => {
          eventRefs.current[highlightedEventId]?.classList.remove("ring-2", "ring-blue-500", "ring-offset-2");
        }, 2000);
      }, 100);
    }
  }, [highlightedEventId, events]);

  const handleFilterClick = (filterValue: string) => {
    let newFilters: string[];
    if (filterValue === "all") {
      newFilters = ["all"];
    } else {
      if (activeFilters.includes("all")) {
        newFilters = [filterValue];
      } else if (activeFilters.includes(filterValue)) {
        newFilters = activeFilters.filter((f) => f !== filterValue);
        if (newFilters.length === 0) {
          newFilters = ["all"];
        }
      } else {
        newFilters = [...activeFilters.filter((f) => f !== "all"), filterValue];
      }
    }
    setActiveFilters(newFilters);
    if (onFilterChange) {
      const types = newFilters.includes("all") ? [] : newFilters;
      onFilterChange(types);
    }
  };

  const handleDateFilterChange = (filterValue: string) => {
    setDateFilter(filterValue);
    // Reload timeline with date filter
    if (onFilterChange) {
      const types = activeFilters.includes("all") ? [] : activeFilters;
      onFilterChange(types, filterValue);
    }
  };

  const filteredEvents = events.filter((event) => {
    if (activeFilters.includes("all")) return true;
    return activeFilters.includes(event.type);
  });

  // Apply grouping to filtered events
  const groupedEventsList = groupSimilarEvents(filteredEvents);

  // Group events by day for display
  const groupEventsByDay = (items: (ContactTimelineEvent | GroupedEvent)[]): Record<string, (ContactTimelineEvent | GroupedEvent)[]> => {
    const groups: Record<string, (ContactTimelineEvent | GroupedEvent)[]> = {};
    
    items.forEach((item) => {
      const event = "firstEvent" in item ? item.firstEvent : item;
      const dateStr = event.occurred_at || event.createdAt;
      if (!dateStr) return;
      
      const date = new Date(dateStr);
      let key: string;
      
      if (isToday(date)) {
        key = "Today";
      } else if (isYesterday(date)) {
        key = "Yesterday";
      } else {
        key = formatDate(date, "MMM d, yyyy");
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });
    
    return groups;
  };

  const groupedByDay = groupEventsByDay(groupedEventsList);

  const formatTime = (dateString: string | undefined) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return formatDate(date, "h:mm a");
  };

  const handleViewThread = (threadId: string | undefined) => {
    if (!threadId) return;
    // Navigate to thread view - adjust route as needed
    router.push(`/inbox/threads/${threadId}`);
  };

  const handleViewTask = (taskId: string | undefined) => {
    if (!taskId) return;
    // Navigate to task view - adjust route as needed
    router.push(`/tasks/${taskId}`);
  };

  const handleViewCampaign = (campaignId: string | undefined) => {
    if (!campaignId) return;
    router.push(`/campaigns/${campaignId}`);
  };

  const handleViewNote = (noteId: string | undefined) => {
    if (!noteId) return;
    // Could open a modal or navigate - for now just scroll to it
    if (eventRefs.current[noteId]) {
      eventRefs.current[noteId].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const renderEvent = (event: ContactTimelineEvent, onClick?: () => void) => {
    const icon = eventIcons[event.type] || <Circle className="h-4 w-4" />;
    const color = eventColors[event.type] || "bg-gray-500";
    const dateStr = event.occurred_at || event.createdAt;
    const isHighlighted = highlightedEventId === event.id;
    const isSelected = selectedEvent?.id === event.id;

    return (
      <div
        key={event.id}
        ref={(el) => {
          if (el) eventRefs.current[event.id] = el;
        }}
        onClick={onClick || (() => setSelectedEvent(event))}
        className={`flex gap-4 pb-6 last:pb-0 cursor-pointer hover:bg-muted/50 rounded-lg p-2 transition-colors ${
          isHighlighted ? "ring-2 ring-blue-500 ring-offset-2" : ""
        } ${isSelected ? "bg-muted" : ""}`}
      >
        {/* Timeline line and dot */}
        <div className="flex flex-col items-center">
          <div className={`rounded-full p-2 ${color} text-white`}>
            {icon}
          </div>
          <div className="w-0.5 h-full bg-border mt-2" />
        </div>

        {/* Event content */}
        <div className="flex-1 min-w-0 pb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="font-medium">{event.title}</div>
              {event.body && (
                <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {event.body}
                </div>
              )}
              
              {/* Message snippet for emails/replies */}
              {(event.type === "email_sent" || event.type === "reply_received" || event.type === "email_reply") && event.meta.message_snippet && (
                <div className="text-sm text-muted-foreground mt-1 italic">
                  "{event.meta.message_snippet}"
                </div>
              )}

              {/* Intent badge - Block 16000 */}
              {(event.type === "email_replied" || event.type === "intent_detected" || event.type === "reply_received" || event.type === "email_reply" || event.type === "intent_changed") && event.meta.intent && (
                <div className="mt-2">
                  <Badge
                    variant={
                      event.meta.intent === "HOT" ||
                      event.meta.intent === "HOT_LEAD" ||
                      event.meta.intent === "hot_lead" ||
                      event.meta.intent === "interested"
                        ? "destructive"
                        : "default"
                    }
                  >
                    {event.meta.intent_label || event.meta.new_intent || event.meta.intent}
                  </Badge>
                  {event.meta.intent_confidence && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({Math.round(event.meta.intent_confidence * 100)}%)
                    </span>
                  )}
                </div>
              )}

              {/* Intent change details */}
              {(event.type === "intent_detected" || event.type === "intent_changed") && event.meta.old_intent && event.meta.new_intent && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline">{event.meta.old_intent}</Badge>
                  <ArrowRight className="h-3 w-3" />
                  <Badge variant={event.meta.new_intent === "HOT" || event.meta.new_intent === "hot_lead" ? "destructive" : "default"}>
                    {event.meta.new_intent}
                  </Badge>
                </div>
              )}

              {/* Pipeline stage change details - Block 16000 */}
              {event.type === "pipeline_stage_changed" && event.meta.old_stage && event.meta.new_stage && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline">{event.meta.old_stage}</Badge>
                  <ArrowRight className="h-3 w-3" />
                  <Badge variant="default">{event.meta.new_stage}</Badge>
                </div>
              )}

              {/* AI opener preview - Block 16000 */}
              {event.type === "ai_opener_generated" && event.body && (
                <div className="mt-2 text-sm text-muted-foreground italic">
                  "{event.body.slice(0, 150)}{event.body.length > 150 ? "..." : ""}"
                </div>
              )}

              {/* Task details */}
              {event.type === "task_created" && event.meta.due_date && (
                <div className="text-xs text-muted-foreground mt-1">
                  Due: {new Date(event.meta.due_date).toLocaleDateString()}
                </div>
              )}

              {/* Tag details - Block 14200 */}
              {(event.type === "tag_added" || event.type === "tag_removed") && event.meta.tag && (
                <div className="mt-2">
                  <Badge variant={event.type === "tag_added" ? "default" : "outline"}>
                    {event.meta.tag}
                  </Badge>
                  {event.meta.source && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({event.meta.source})
                    </span>
                  )}
                </div>
              )}

              {/* Score change details - Block 14200 */}
              {event.type === "score_changed" && event.meta.old_score !== undefined && event.meta.new_score !== undefined && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline">{event.meta.old_score}</Badge>
                  <TrendingUp className="h-3 w-3" />
                  <Badge variant={event.meta.new_score >= 60 ? "destructive" : event.meta.new_score >= 30 ? "default" : "secondary"}>
                    {event.meta.new_score}
                  </Badge>
                  {event.meta.delta && (
                    <span className={`text-xs font-medium ${event.meta.delta > 0 ? "text-green-600" : event.meta.delta < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      ({event.meta.delta > 0 ? "+" : ""}{event.meta.delta})
                    </span>
                  )}
                  {event.meta.reason && (
                    <span className="text-xs text-muted-foreground ml-2">
                      • {event.meta.reason}
                    </span>
                  )}
                </div>
              )}

              {/* Pipeline movement - Block 14200 */}
              {event.type === "pipeline_moved" && event.meta.old_stage && event.meta.new_stage && (
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline">{event.meta.old_stage}</Badge>
                  <ArrowRight className="h-3 w-3" />
                  <Badge variant="default">{event.meta.new_stage}</Badge>
                </div>
              )}

              {/* Enrichment added - Block 14200 */}
              {event.type === "enrichment_added" && event.meta && (
                <div className="mt-2 space-y-1">
                  {event.meta.city && (
                    <div className="text-xs text-muted-foreground">City: {event.meta.city}</div>
                  )}
                  {event.meta.zip && (
                    <div className="text-xs text-muted-foreground">ZIP: {event.meta.zip}</div>
                  )}
                  {event.meta.neighborhood && (
                    <div className="text-xs text-muted-foreground">Neighborhood: {event.meta.neighborhood}</div>
                  )}
                  {event.meta.property_type && (
                    <div className="text-xs text-muted-foreground">Property: {event.meta.property_type}</div>
                  )}
                </div>
              )}

              {/* Suppression event - Block 14200 */}
              {event.type === "suppressed" && (
                <div className="mt-2">
                  <Badge variant="destructive">Suppressed</Badge>
                  {event.meta.reason && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {event.meta.reason}
                    </span>
                  )}
                </div>
              )}

              {/* Campaign step - Block 14200 */}
              {event.type === "campaign_step" && event.meta.step && (
                <div className="mt-2 text-sm text-muted-foreground">
                  Step {event.meta.step} • {event.meta.template_name || "Template used"}
                  {event.meta.wait_timer && (
                    <span className="ml-2">• Wait: {event.meta.wait_timer}</span>
                  )}
                </div>
              )}

              {/* Storm event - Block 14200 */}
              {event.type === "storm_event" && (
                <div className="mt-2">
                  <Badge variant="outline" className="bg-slate-100">
                    {event.meta.storm_type || "Storm detected"}
                  </Badge>
                  {event.meta.location && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {event.meta.location}
                    </span>
                  )}
                </div>
              )}

              {/* Merge event details */}
              {event.type === "contact_merged" && event.meta.merged_contact_email && (
                <div className="text-sm text-muted-foreground mt-1">
                  Merged from: {event.meta.merged_contact_email}
                </div>
              )}

              {/* Action links */}
              <div className="flex gap-2 mt-2 flex-wrap">
                {(event.type === "reply_received" || event.type === "email_reply") && event.meta.thread_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleViewThread(event.meta.thread_id)}
                  >
                    <MessageSquare className="h-3 w-3 mr-1" />
                    View Thread
                  </Button>
                )}
                {(event.type === "task_created" || event.type === "task_completed" || event.type === "task_assigned") && event.meta.task_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleViewTask(event.meta.task_id)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View Task
                  </Button>
                )}
                {event.type === "campaign_enrolled" && event.meta.campaign_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleViewCampaign(event.meta.campaign_id)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View Campaign
                  </Button>
                )}
                {event.type === "note_added" && event.meta.note_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleViewNote(event.meta.note_id)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View Note
                  </Button>
                )}
              </div>

              {/* User info */}
              {event.user && (
                <div className="text-xs text-muted-foreground mt-1">
                  by {event.user.name}
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {formatTime(dateStr)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderGroupedEvent = (group: GroupedEvent) => {
    const icon = eventIcons[group.type] || <Circle className="h-4 w-4" />;
    const color = eventColors[group.type] || "bg-gray-500";
    const isExpanded = expandedGroups.has(group.id);
    const dateStr = group.firstEvent.occurred_at || group.firstEvent.createdAt;

    return (
      <div key={group.id} className="flex gap-4 pb-6 last:pb-0">
        <div className="flex flex-col items-center">
          <div className={`rounded-full p-2 ${color} text-white`}>
            {icon}
          </div>
          <div className="w-0.5 h-full bg-border mt-2" />
        </div>
        <div className="flex-1 min-w-0 pb-6">
          <button
            onClick={() => toggleGroup(group.id)}
            className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded-lg p-2 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <div className="font-medium">
              {group.firstEvent.meta?.campaign_name || "Campaign"} ({group.count} steps executed)
            </div>
            <div className="text-xs text-muted-foreground ml-auto">
              {formatTime(dateStr)}
            </div>
          </button>
          {isExpanded && (
            <div className="ml-6 mt-2 space-y-2">
              {group.events.map((event) => renderEvent(event))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <div className="flex flex-wrap gap-2 items-center">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        {DATE_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={dateFilter === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => handleDateFilterChange(filter.value)}
            className="h-8 text-xs"
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {/* Event Type Filters */}
      <div className="flex flex-wrap gap-2">
        {EVENT_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={activeFilters.includes(filter.value) ? "default" : "outline"}
            size="sm"
            onClick={() => handleFilterClick(filter.value)}
            className="h-8 text-xs"
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {/* Add Note Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => setIsNoteModalOpen(true)}
        >
          Add Note
        </Button>
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="p-6">
          {loading && events.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(groupedEvents).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No activity yet
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedByDay).map(([day, dayItems]) => (
                <div key={day}>
                  <div className="text-sm font-semibold text-muted-foreground mb-4">
                    {day}
                  </div>
                  <div className="space-y-0">
                    {dayItems.map((item) => {
                      if ("count" in item) {
                        return renderGroupedEvent(item);
                      } else {
                        return renderEvent(item);
                      }
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load More Button */}
          {hasMore && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={onLoadMore}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Note Modal */}
      <AddNoteModal
        open={isNoteModalOpen}
        onOpenChange={setIsNoteModalOpen}
        contactId={contactId}
        onNoteAdded={() => {
          setIsNoteModalOpen(false);
          onNoteAdded();
        }}
      />
    </div>
  );
}
