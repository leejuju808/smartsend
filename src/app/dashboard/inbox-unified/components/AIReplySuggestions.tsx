"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Sparkles, Copy, Send, Loader2 } from "lucide-react";

type Suggestion = {
  type: string;
  label: string;
  description: string;
  subject: string;
  body: string;
};

type Suggestions = {
  fast: Suggestion;
  relationship: Suggestion;
  close: Suggestion;
};

export function AIReplySuggestions({ messageId }: { messageId: string }) {
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);

  useEffect(() => {
    loadSuggestions();
  }, [messageId]);

  async function loadSuggestions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/unified/${messageId}/suggestions`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error("Error loading suggestions:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(suggestion: Suggestion) {
    navigator.clipboard.writeText(suggestion.body);
  }

  function handleUse(suggestion: Suggestion) {
    setSelectedSuggestion(suggestion);
    // In a real implementation, this would open a compose modal
    // For now, we'll just copy to clipboard
    navigator.clipboard.writeText(`${suggestion.subject}\n\n${suggestion.body}`);
    alert("Reply copied to clipboard!");
  }

  if (loading) {
    return (
      <div className="text-center py-4">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">Generating suggestions...</p>
      </div>
    );
  }

  if (!suggestions) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">No suggestions available</p>
        <Button size="sm" variant="outline" onClick={loadSuggestions} className="mt-2">
          Generate Suggestions
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">AI Reply Suggestions</h3>
      </div>

      <div className="space-y-3">
        {/* Fast Response */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{suggestions.fast.label}</CardTitle>
            <p className="text-xs text-muted-foreground">{suggestions.fast.description}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm mb-3 p-3 bg-muted rounded border">
              <div className="font-medium mb-1">{suggestions.fast.subject}</div>
              <div className="whitespace-pre-wrap">{suggestions.fast.body}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleCopy(suggestions.fast)}>
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
              <Button size="sm" onClick={() => handleUse(suggestions.fast)}>
                <Send className="h-3 w-3 mr-1" />
                Use
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Relationship Response */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{suggestions.relationship.label}</CardTitle>
            <p className="text-xs text-muted-foreground">{suggestions.relationship.description}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm mb-3 p-3 bg-muted rounded border">
              <div className="font-medium mb-1">{suggestions.relationship.subject}</div>
              <div className="whitespace-pre-wrap">{suggestions.relationship.body}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleCopy(suggestions.relationship)}>
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
              <Button size="sm" onClick={() => handleUse(suggestions.relationship)}>
                <Send className="h-3 w-3 mr-1" />
                Use
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Close Response */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{suggestions.close.label}</CardTitle>
            <p className="text-xs text-muted-foreground">{suggestions.close.description}</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm mb-3 p-3 bg-muted rounded border">
              <div className="font-medium mb-1">{suggestions.close.subject}</div>
              <div className="whitespace-pre-wrap">{suggestions.close.body}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleCopy(suggestions.close)}>
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
              <Button size="sm" onClick={() => handleUse(suggestions.close)}>
                <Send className="h-3 w-3 mr-1" />
                Use
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


































