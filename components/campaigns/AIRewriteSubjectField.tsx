"use client";

import { useTransition, useState } from "react";
import { rewriteTemplate } from "@/actions/rewriteTemplate";
import { generateSubjectIdeas } from "@/actions/generateSubjectIdeas";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles } from "lucide-react";

interface SubjectFieldProps {
  campaignId?: string;
  stepPosition?: number | null;
  value: string;
  onChange: (value: string) => void;
}

export function AIRewriteSubjectField({
  campaignId,
  stepPosition,
  value,
  onChange,
}: SubjectFieldProps) {
  const [isPending, startTransition] = useTransition();
  const [ideas, setIdeas] = useState<string[]>([]);
  const [ideasOpen, setIdeasOpen] = useState(false);

  function handleRewrite(tone: "casual" | "professional" | "direct" | "playful", goal: "more_replies" | "shorter" | "clearer" | "warmer" | "more_opens") {
    startTransition(async () => {
      try {
        const res = await rewriteTemplate({
          campaignId,
          stepPosition,
          text: value,
          target: "subject",
          tone,
          goal: goal === "more_opens" ? "more_replies" : goal,
        });
        onChange(res.rewritten);
      } catch (error) {
        console.error("Rewrite failed:", error);
        alert("Failed to rewrite subject. Please try again.");
      }
    });
  }

  async function loadIdeas() {
    try {
      const res = await generateSubjectIdeas({
        campaignId,
        baseSubject: value,
        tone: "professional",
        goal: "more_opens",
      });
      setIdeas(res.subjects);
      setIdeasOpen(true);
    } catch (error) {
      console.error("Failed to generate ideas:", error);
      alert("Failed to generate subject ideas. Please try again.");
    }
  }

  return (
    <div className="flex items-center justify-end gap-2 mb-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="xs" disabled={isPending}>
                <Sparkles className="w-3 h-3 mr-1" />
                AI rewrite
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 text-xs space-y-2">
              <p className="font-semibold">Rewrite subject</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => handleRewrite("professional", "more_replies")}
                  disabled={isPending}
                >
                  Pro / Replies
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => handleRewrite("casual", "more_replies")}
                  disabled={isPending}
                >
                  Casual / Replies
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => handleRewrite("direct", "shorter")}
                  disabled={isPending}
                >
                  Direct / Shorter
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => handleRewrite("playful", "more_opens")}
                  disabled={isPending}
                >
                  Playful / Opens
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Popover open={ideasOpen} onOpenChange={setIdeasOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                onClick={loadIdeas}
                disabled={isPending}
              >
                Ideas
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 max-h-72 overflow-y-auto text-xs space-y-2">
              <p className="font-semibold mb-1">Subject ideas</p>
              {ideas.length === 0 ? (
                <p className="text-muted-foreground">Click "Ideas" to generate suggestions</p>
              ) : (
                <ul className="space-y-1">
                  {ideas.map((s, i) => (
                    <li
                      key={i}
                      className="cursor-pointer rounded border px-2 py-1 hover:bg-muted"
                      onClick={() => {
                        onChange(s);
                        setIdeasOpen(false);
                      }}
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
    </div>
  );
}

