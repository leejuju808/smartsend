"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Archive } from "lucide-react";

interface LongThreadHandlerProps {
  threadId: string;
  messageCount: number;
  onLoadEarlier?: () => void;
}

/**
 * Block 19700 — Long Thread Handler
 * Handles threads with 50+ messages by archiving older ones and showing load button
 */
export function LongThreadHandler({
  threadId,
  messageCount,
  onLoadEarlier,
}: LongThreadHandlerProps) {
  if (messageCount < 50) return null;

  const archivedCount = messageCount - 50;

  return (
    <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
      <Archive className="h-4 w-4 text-blue-600" />
      <AlertDescription className="flex items-center justify-between">
        <span>
          This thread has {messageCount} messages. {archivedCount > 0 && `${archivedCount} older messages are archived.`}
        </span>
        {onLoadEarlier && (
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadEarlier}
            className="ml-4"
          >
            Load earlier messages
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}



















































