// Block 22126 — SmartSend Roofing Homeowner Transcript v1
// TranscriptFilterBar: Filter and search controls for transcript
// Filters: sender type, tone, intent, search, jump to events

"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X } from "lucide-react";
import { TranscriptMessage } from "./TranscriptBubble";
import { cn } from "@/lib/utils";

interface TranscriptFilterBarProps {
  messages: TranscriptMessage[];
  filters: {
    senderType: "all" | "homeowner" | "estimator" | "ai" | "system";
    tone: string;
    intent: string;
    searchQuery: string;
  };
  onFiltersChange: (filters: TranscriptFilterBarProps["filters"]) => void;
  onJumpTo: (messageId: string) => void;
}

export function TranscriptFilterBar({
  messages,
  filters,
  onFiltersChange,
  onJumpTo,
}: TranscriptFilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);

  // Extract unique tones and intents from messages
  const availableTones = useMemo(() => {
    const tones = new Set<string>();
    messages.forEach((msg) => {
      if (msg.tone) tones.add(msg.tone);
    });
    return Array.from(tones).sort();
  }, [messages]);

  const availableIntents = useMemo(() => {
    const intents = new Set<string>();
    messages.forEach((msg) => {
      if (msg.intent) intents.add(msg.intent);
    });
    return Array.from(intents).sort();
  }, [messages]);

  // Find special messages for jump-to
  const firstMessage = messages[0];
  const mostFrustratedMessage = useMemo(() => {
    return messages.reduce((prev, curr) => {
      if (curr.tone === "angry" || curr.tone === "impatient") {
        if (!prev || (curr.sentiment_score !== null && (prev.sentiment_score === null || curr.sentiment_score < prev.sentiment_score))) {
          return curr;
        }
      }
      return prev;
    }, null as TranscriptMessage | null);
  }, [messages]);

  const highestMomentumMessage = useMemo(() => {
    return messages.reduce((prev, curr) => {
      if (curr.intent === "ready to book" || curr.intent === "high intent") {
        if (!prev || (curr.sentiment_score !== null && (prev.sentiment_score === null || curr.sentiment_score > prev.sentiment_score))) {
          return curr;
        }
      }
      return prev;
    }, null as TranscriptMessage | null);
  }, [messages]);

  const proposalSentMessage = useMemo(() => {
    return messages.find((msg) => 
      msg.message_text.toLowerCase().includes("proposal") ||
      msg.message_text.toLowerCase().includes("quote") ||
      msg.message_text.toLowerCase().includes("estimate")
    ) || null;
  }, [messages]);

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      senderType: "all",
      tone: "all",
      intent: "all",
      searchQuery: "",
    });
  };

  const hasActiveFilters = filters.senderType !== "all" || filters.tone !== "all" || filters.intent !== "all" || filters.searchQuery !== "";

  return (
    <div className="border-b border-gray-800 bg-gray-900/50 p-4 space-y-3">
      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search messages, tone, intent..."
            value={filters.searchQuery}
            onChange={(e) => handleFilterChange("searchQuery", e.target.value)}
            className="pl-10 bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="border-gray-700 text-gray-300 hover:bg-gray-800"
        >
          <Filter className="w-4 h-4 mr-2" />
          Filters
        </Button>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-gray-400 hover:text-gray-200"
          >
            <X className="w-4 h-4 mr-2" />
            Clear
          </Button>
        )}
      </div>

      {/* Filter Options */}
      {showFilters && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-gray-800">
          {/* Sender Type Filter */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Sender</label>
            <Select
              value={filters.senderType}
              onValueChange={(value) => handleFilterChange("senderType", value)}
            >
              <SelectTrigger className="bg-gray-800/50 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all">All Messages</SelectItem>
                <SelectItem value="homeowner">Homeowner Only</SelectItem>
                <SelectItem value="estimator">Estimator Only</SelectItem>
                <SelectItem value="ai">AI Messages</SelectItem>
                <SelectItem value="system">System Messages</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tone Filter */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tone</label>
            <Select
              value={filters.tone}
              onValueChange={(value) => handleFilterChange("tone", value)}
            >
              <SelectTrigger className="bg-gray-800/50 border-gray-700 text-white">
                <SelectValue placeholder="All Tones" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all">All Tones</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
                {availableTones.map((tone) => (
                  <SelectItem key={tone} value={tone}>
                    {tone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Intent Filter */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Intent</label>
            <Select
              value={filters.intent}
              onValueChange={(value) => handleFilterChange("intent", value)}
            >
              <SelectTrigger className="bg-gray-800/50 border-gray-700 text-white">
                <SelectValue placeholder="All Intents" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="all">All Intents</SelectItem>
                <SelectItem value="high interest">High Interest</SelectItem>
                <SelectItem value="price sensitive">Price Sensitive</SelectItem>
                <SelectItem value="question">Question</SelectItem>
                {availableIntents.map((intent) => (
                  <SelectItem key={intent} value={intent}>
                    {intent}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Jump To Quick Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-800">
        <span className="text-xs text-gray-400">Jump to:</span>
        {firstMessage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onJumpTo(firstMessage.id)}
            className="text-xs h-7 text-gray-300 hover:text-white hover:bg-gray-800"
          >
            First Message
          </Button>
        )}
        {mostFrustratedMessage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onJumpTo(mostFrustratedMessage.id)}
            className="text-xs h-7 text-gray-300 hover:text-white hover:bg-gray-800"
          >
            😡 Most Frustrated
          </Button>
        )}
        {highestMomentumMessage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onJumpTo(highestMomentumMessage.id)}
            className="text-xs h-7 text-gray-300 hover:text-white hover:bg-gray-800"
          >
            🔥 Highest Momentum
          </Button>
        )}
        {proposalSentMessage && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onJumpTo(proposalSentMessage.id)}
            className="text-xs h-7 text-gray-300 hover:text-white hover:bg-gray-800"
          >
            📄 Proposal Sent
          </Button>
        )}
      </div>

      {/* Active Filter Badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.senderType !== "all" && (
            <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
              Sender: {filters.senderType}
            </Badge>
          )}
          {filters.tone !== "all" && (
            <Badge variant="secondary" className="bg-purple-500/20 text-purple-300 border-purple-500/30">
              Tone: {filters.tone}
            </Badge>
          )}
          {filters.intent !== "all" && (
            <Badge variant="secondary" className="bg-green-500/20 text-green-300 border-green-500/30">
              Intent: {filters.intent}
            </Badge>
          )}
          {filters.searchQuery && (
            <Badge variant="secondary" className="bg-gray-500/20 text-gray-300 border-gray-500/30">
              Search: "{filters.searchQuery}"
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}









































