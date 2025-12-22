"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";

const TONES = ["formal", "casual", "humorous", "assertive"] as const;

export type Tone = (typeof TONES)[number];

export function ToneLabeler({
  replyId,
  initialTone = null,
  onToneChange,
}: {
  replyId: string;
  initialTone?: Tone | null;
  onToneChange?: (tone: Tone) => void;
}) {
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string | null>(initialTone);

  useEffect(() => {
    setPicked(initialTone);
  }, [initialTone]);

  const setTone = useCallback(
    (tone: Tone) => {
      setPicked(tone);
      onToneChange?.(tone);
      start(async () => {
        await fetch(`/api/replies/${replyId}/tone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tone }),
        });
      });
    },
    [onToneChange, replyId, start],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, Tone> = {
        "1": "formal",
        "2": "casual",
        "3": "humorous",
        "4": "assertive",
      };
      const tone = map[e.key];
      if (tone) {
        setTone(tone);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTone]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-xs font-medium text-muted-foreground">
        Tone {picked ? `— ${picked}` : "— unlabeled"}
      </div>
      <div className="flex flex-wrap gap-2">
        {TONES.map((tone) => (
          <Button
            key={tone}
            variant={picked === tone ? "default" : "outline"}
            className="capitalize rounded-2xl"
            disabled={pending}
            onClick={() => setTone(tone)}
            title={`Label this reply as ${tone} (shortcut ${toneToShortcut(tone)})`}
            size="sm"
          >
            {tone}
          </Button>
        ))}
      </div>
    </div>
  );
}

function toneToShortcut(tone: Tone) {
  switch (tone) {
    case "formal":
      return "1";
    case "casual":
      return "2";
    case "humorous":
      return "3";
    case "assertive":
      return "4";
    default:
      return "";
  }
}


