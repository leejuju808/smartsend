"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, X, User, MessageSquare, Megaphone, CheckSquare, Clock, Settings, CreditCard, LayoutDashboard, Inbox } from "lucide-react";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { SearchResult, ContactResult, ReplyResult, CampaignResult, TaskResult, ActivityResult, CommandResult } from "@/types/search";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { results, loading, topMatches } = useGlobalSearch(query);

  // Flatten all results into a single array for keyboard navigation
  // Order: Top Matches first (if any), then by section
  const allResults: SearchResult[] = useMemo(() => {
    const flat: SearchResult[] = [];
    
    // Add top matches first (they'll be deduplicated in sections)
    const topMatchIds = new Set(topMatches.map(r => r.id));
    
    // Then add all results by section
    if (results.contacts.length > 0) {
      flat.push(...results.contacts);
    }
    if (results.replies.length > 0) {
      flat.push(...results.replies);
    }
    if (results.campaigns.length > 0) {
      flat.push(...results.campaigns);
    }
    if (results.tasks.length > 0) {
      flat.push(...results.tasks);
    }
    if (results.activity.length > 0) {
      flat.push(...results.activity);
    }
    if (results.commands.length > 0) {
      flat.push(...results.commands);
    }
    
    return flat;
  }, [results, topMatches]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [allResults.length]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (allResults[selectedIndex]) {
          handleSelect(allResults[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, allResults, selectedIndex, onClose]);

  const handleSelect = (result: SearchResult) => {
    if (result.type === "contact") {
      router.push(`/contacts/${result.contactId || result.id}`);
    } else if (result.type === "reply") {
      const replyResult = result as ReplyResult;
      router.push(`/inbox/replies?threadId=${replyResult.threadId}`);
    } else if (result.type === "campaign") {
      const campaignResult = result as CampaignResult;
      router.push(`/campaigns/${campaignResult.campaignId || result.id}/analytics`);
    } else if (result.type === "task") {
      const taskResult = result as TaskResult;
      if (taskResult.contactId) {
        router.push(`/contacts/${taskResult.contactId}#tasks`);
      } else {
        router.push(`/tasks?taskId=${taskResult.taskId}`);
      }
    } else if (result.type === "activity") {
      const activityResult = result as ActivityResult;
      // Route to best context based on activity type
      if (activityResult.relatedThreadId) {
        router.push(`/inbox/replies?threadId=${activityResult.relatedThreadId}`);
      } else if (activityResult.relatedContactId) {
        router.push(`/contacts/${activityResult.relatedContactId}`);
      } else if (activityResult.relatedCampaignId) {
        router.push(`/campaigns/${activityResult.relatedCampaignId}/analytics`);
      } else {
        // Fallback to activity feed if available
        router.push(`/activity`);
      }
    } else if (result.type === "command") {
      const commandResult = result as CommandResult;
      router.push(commandResult.path);
    }
    onClose();
  };

  const getResultIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "contact":
        return <User className="h-4 w-4" />;
      case "reply":
        return <MessageSquare className="h-4 w-4" />;
      case "campaign":
        return <Megaphone className="h-4 w-4" />;
      case "task":
        return <CheckSquare className="h-4 w-4" />;
      case "activity":
        return <Clock className="h-4 w-4" />;
      case "command":
        return <Settings className="h-4 w-4" />;
    }
  };
  
  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case "email_sent":
        return "📤";
      case "reply":
        return "💬";
      case "intent_hot":
        return "🔥";
      case "status_change":
        return "🔄";
      case "task_created":
      case "task_completed":
        return <CheckSquare className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const renderContactResult = (result: ContactResult, index: number) => {
    const isSelected = index === selectedIndex;
    return (
      <div
        key={result.id}
        onClick={() => handleSelect(result)}
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          {getResultIcon("contact")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">
            {result.name || result.email}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {result.email}
            {result.status && ` · ${result.status}`}
            {result.city && result.state && ` · ${result.city}, ${result.state}`}
          </div>
        </div>
        <div className="flex-shrink-0">
          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Contact</span>
        </div>
      </div>
    );
  };

  const renderReplyResult = (result: ReplyResult, index: number) => {
    const isSelected = index === selectedIndex;
    const intentColors: Record<string, string> = {
      hot: "bg-red-100 text-red-800",
      warm: "bg-orange-100 text-orange-800",
      follow_up: "bg-blue-100 text-blue-800",
      not_interested: "bg-gray-100 text-gray-800",
      unclassified: "bg-gray-100 text-gray-800",
    };
    return (
      <div
        key={result.id}
        onClick={() => handleSelect(result)}
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          {getResultIcon("reply")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">
            Reply from {result.contactName || result.contactEmail || "Unknown"}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            Intent: <span className={cn("px-1 rounded", intentColors[result.latestIntent] || intentColors.unclassified)}>
              {result.latestIntent.toUpperCase()}
            </span>
            {result.campaignName && ` · Campaign: ${result.campaignName}`}
            {result.snippet && ` · "${result.snippet.substring(0, 50)}..."`}
          </div>
        </div>
        <div className="flex-shrink-0">
          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Reply</span>
        </div>
      </div>
    );
  };

  const renderCampaignResult = (result: CampaignResult, index: number) => {
    const isSelected = index === selectedIndex;
    return (
      <div
        key={result.id}
        onClick={() => handleSelect(result)}
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          {getResultIcon("campaign")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{result.name}</div>
          <div className="text-xs text-muted-foreground">
            Status: {result.status}
          </div>
        </div>
        <div className="flex-shrink-0">
          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Campaign</span>
        </div>
      </div>
    );
  };

  const renderTaskResult = (result: TaskResult, index: number) => {
    const isSelected = index === selectedIndex;
    const dueDate = result.dueAt ? new Date(result.dueAt) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let dueText = "";
    if (dueDate) {
      const dueDateOnly = new Date(dueDate);
      dueDateOnly.setHours(0, 0, 0, 0);
      if (dueDateOnly.getTime() === today.getTime()) {
        dueText = "Due today";
      } else if (dueDate < today) {
        dueText = "Overdue";
      } else {
        dueText = `Due ${dueDate.toLocaleDateString()}`;
      }
    }
    
    return (
      <div
        key={result.id}
        onClick={() => handleSelect(result)}
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          {result.completed ? "✅" : "⏰"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{result.title}</div>
          <div className="text-xs text-muted-foreground">
            {dueText}
            {result.contactName && ` · Contact: ${result.contactName}`}
          </div>
        </div>
        <div className="flex-shrink-0">
          <span className={cn(
            "text-xs px-2 py-1 rounded",
            result.completed ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
          )}>
            {result.completed ? "Completed" : "Open"}
          </span>
        </div>
      </div>
    );
  };

  const renderActivityResult = (result: ActivityResult, index: number) => {
    const isSelected = index === selectedIndex;
    const createdAt = new Date(result.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    let timeAgo = "";
    if (diffHours < 1) {
      timeAgo = "Just now";
    } else if (diffHours < 24) {
      timeAgo = `${diffHours}h ago`;
    } else if (diffDays === 1) {
      timeAgo = "1 day ago";
    } else {
      timeAgo = `${diffDays}d ago`;
    }
    
    return (
      <div
        key={result.id}
        onClick={() => handleSelect(result)}
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          {typeof getActivityIcon(result.activityType) === "string" ? (
            <span className="text-lg">{getActivityIcon(result.activityType)}</span>
          ) : (
            getActivityIcon(result.activityType)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{result.title}</div>
          <div className="text-xs text-muted-foreground">
            {result.description && `${result.description.substring(0, 50)}...`}
            {result.relatedCampaignId && ` · Campaign`}
            {` · ${timeAgo}`}
          </div>
        </div>
        <div className="flex-shrink-0">
          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Activity</span>
        </div>
      </div>
    );
  };

  const renderCommandResult = (result: CommandResult, index: number) => {
    const isSelected = index === selectedIndex;
    const iconMap: Record<string, React.ReactNode> = {
      '/dashboard': <LayoutDashboard className="h-4 w-4" />,
      '/contacts': <User className="h-4 w-4" />,
      '/inbox/replies': <Inbox className="h-4 w-4" />,
      '/tasks': <CheckSquare className="h-4 w-4" />,
      '/settings/billing': <CreditCard className="h-4 w-4" />,
      '/settings': <Settings className="h-4 w-4" />,
    };
    
    const icon = iconMap[result.path] || <Settings className="h-4 w-4" />;
    
    return (
      <div
        key={result.id}
        onClick={() => handleSelect(result)}
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{result.label}</div>
        </div>
        <div className="flex-shrink-0">
          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Command</span>
        </div>
      </div>
    );
  };

  if (!open) return null;

  const hasResults = 
    results.contacts.length > 0 || 
    results.replies.length > 0 || 
    results.campaigns.length > 0 ||
    results.tasks.length > 0 ||
    results.activity.length > 0 ||
    results.commands.length > 0;
    
  const totalResults = 
    results.contacts.length + 
    results.replies.length + 
    results.campaigns.length +
    results.tasks.length +
    results.activity.length +
    results.commands.length;
    
  const hasTopMatches = topMatches.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-4"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-lg shadow-xl w-full max-w-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts, replies, campaigns, tasks, activity…"
            className="flex-1 bg-transparent border-none outline-none text-sm"
          />
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          )}

          {!loading && !query.trim() && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Start typing to search contacts, replies, and campaigns
            </div>
          )}

          {!loading && query.trim() && !hasResults && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No matches. Try a different name, email, campaign title, or task.
            </div>
          )}

          {!loading && hasResults && (
            <div className="py-2">
              {/* Top Matches Section */}
              {hasTopMatches && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Top Matches
                  </div>
                  {topMatches.map((match) => {
                    const globalIndex = allResults.indexOf(match);
                    if (match.type === "contact") {
                      return renderContactResult(match as ContactResult, globalIndex);
                    } else if (match.type === "reply") {
                      return renderReplyResult(match as ReplyResult, globalIndex);
                    } else if (match.type === "campaign") {
                      return renderCampaignResult(match as CampaignResult, globalIndex);
                    } else if (match.type === "task") {
                      return renderTaskResult(match as TaskResult, globalIndex);
                    } else if (match.type === "activity") {
                      return renderActivityResult(match as ActivityResult, globalIndex);
                    } else if (match.type === "command") {
                      return renderCommandResult(match as CommandResult, globalIndex);
                    }
                    return null;
                  })}
                </div>
              )}

              {/* Contacts Section */}
              {results.contacts.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Contacts · {results.contacts.length}
                  </div>
                  {results.contacts.map((contact) => {
                    const globalIndex = allResults.indexOf(contact);
                    return renderContactResult(contact, globalIndex);
                  })}
                </div>
              )}

              {/* Replies Section */}
              {results.replies.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Replies · {results.replies.length}
                  </div>
                  {results.replies.map((reply) => {
                    const globalIndex = allResults.indexOf(reply);
                    return renderReplyResult(reply, globalIndex);
                  })}
                </div>
              )}

              {/* Campaigns Section */}
              {results.campaigns.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Campaigns · {results.campaigns.length}
                  </div>
                  {results.campaigns.map((campaign) => {
                    const globalIndex = allResults.indexOf(campaign);
                    return renderCampaignResult(campaign, globalIndex);
                  })}
                </div>
              )}

              {/* Tasks Section */}
              {results.tasks.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Tasks · {results.tasks.length}
                  </div>
                  {results.tasks.map((task) => {
                    const globalIndex = allResults.indexOf(task);
                    return renderTaskResult(task, globalIndex);
                  })}
                </div>
              )}

              {/* Activity Section */}
              {results.activity.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Activity · {results.activity.length}
                  </div>
                  {results.activity.map((activity) => {
                    const globalIndex = allResults.indexOf(activity);
                    return renderActivityResult(activity, globalIndex);
                  })}
                </div>
              )}

              {/* Commands Section */}
              {results.commands.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                    Commands · {results.commands.length}
                  </div>
                  {results.commands.map((command) => {
                    const globalIndex = allResults.indexOf(command);
                    return renderCommandResult(command, globalIndex);
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {hasResults && (
          <div className="px-4 py-2 border-t text-xs text-muted-foreground flex items-center justify-between">
            <span>{totalResults} result{totalResults !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-4">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

