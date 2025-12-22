// useGlobalSearch hook - Block 9300 (v1) + Block 10800 (v2)

import { useState, useEffect, useMemo } from "react";
import { SearchResponse, SearchResult, CommandResult } from "@/types/search";

// Static commands registry
const STATIC_COMMANDS: CommandResult[] = [
  { id: 'cmd_dashboard', type: 'command', label: 'Go to Dashboard', path: '/dashboard', score: 0 },
  { id: 'cmd_contacts', type: 'command', label: 'Open Contacts', path: '/contacts', score: 0 },
  { id: 'cmd_inbox', type: 'command', label: 'Open Reply Inbox', path: '/inbox/replies', score: 0 },
  { id: 'cmd_tasks', type: 'command', label: 'Open Tasks', path: '/tasks', score: 0 },
  { id: 'cmd_billing', type: 'command', label: 'Open Billing', path: '/settings/billing', score: 0 },
  { id: 'cmd_settings', type: 'command', label: 'Open Settings', path: '/settings', score: 0 },
];

// Check if query matches a command
function getMatchingCommands(query: string): CommandResult[] {
  if (!query.trim()) return [];
  
  const queryLower = query.trim().toLowerCase();
  const commandKeywords: Record<string, string[]> = {
    'cmd_dashboard': ['dashboard', 'home', 'main'],
    'cmd_contacts': ['contacts', 'contact', 'people'],
    'cmd_inbox': ['inbox', 'replies', 'reply', 'messages'],
    'cmd_tasks': ['tasks', 'task', 'todo', 'reminders'],
    'cmd_billing': ['billing', 'bill', 'payment', 'subscription'],
    'cmd_settings': ['settings', 'setting', 'preferences', 'config'],
  };
  
  return STATIC_COMMANDS.filter(cmd => {
    const keywords = commandKeywords[cmd.id] || [];
    return keywords.some(kw => queryLower.includes(kw)) || 
           cmd.label.toLowerCase().includes(queryLower) ||
           cmd.path.toLowerCase().includes(queryLower);
  });
}

export function useGlobalSearch(query: string) {
  const [results, setResults] = useState<SearchResponse>({
    contacts: [],
    replies: [],
    campaigns: [],
    tasks: [],
    activity: [],
    commands: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ 
        contacts: [], 
        replies: [], 
        campaigns: [],
        tasks: [],
        activity: [],
        commands: [],
      });
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&types=contacts,replies,campaigns,tasks,activity`);
        if (!response.ok) {
          throw new Error("Search failed");
        }
        const data: SearchResponse = await response.json();
        
        // Add matching commands
        const matchingCommands = getMatchingCommands(query);
        
        setResults({
          ...data,
          commands: matchingCommands,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults({ 
          contacts: [], 
          replies: [], 
          campaigns: [],
          tasks: [],
          activity: [],
          commands: [],
        });
      } finally {
        setLoading(false);
      }
    }, 250); // 250ms debounce

    return () => clearTimeout(debounceTimer);
  }, [query]);

  // Compute Top Matches (top 5 results across all types by score)
  const topMatches = useMemo(() => {
    const allResults: SearchResult[] = [
      ...results.contacts,
      ...results.replies,
      ...results.campaigns,
      ...results.tasks,
      ...results.activity,
      ...results.commands,
    ];
    
    // Sort by score descending and take top 5
    return allResults
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5);
  }, [results]);

  return { results, loading, error, topMatches };
}

