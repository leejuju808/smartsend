"use client";

import { useTransition } from "react";
import { rewriteTemplate } from "@/actions/rewriteTemplate";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Sparkles } from "lucide-react";

interface BodyFieldProps {
  campaignId?: string;
  stepPosition?: number | null;
  value: string;
  onChange: (value: string) => void;
}

export function AIRewriteBodyField({
  campaignId,
  stepPosition,
  value,
  onChange,
}: BodyFieldProps) {
  const [isPending, startTransition] = useTransition();

  function handleRewrite(
    tone: "casual" | "professional" | "direct" | "playful",
    goal: "more_replies" | "shorter" | "clearer" | "warmer"
  ) {
    startTransition(async () => {
      try {
        const res = await rewriteTemplate({
          campaignId,
          stepPosition,
          text: value,
          target: "body",
          tone,
          goal,
        });
        onChange(res.rewritten);
      } catch (error) {
        console.error("Rewrite failed:", error);
        alert("Failed to rewrite body. Please try again.");
      }
    });
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
          <PopoverContent className="w-60 text-xs space-y-2">
            <p className="font-semibold">Rewrite body</p>
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
                onClick={() => handleRewrite("professional", "clearer")}
                disabled={isPending}
              >
                Clearer
              </Button>
            </div>
          </PopoverContent>
      </Popover>
    </div>
  );
}

