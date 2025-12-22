// Section 6 — AI-Produced Daily Insight

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

interface AIRecommendationSectionProps {
  text: string;
}

export function AIRecommendationSection({ text }: AIRecommendationSectionProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-white">AI Daily Insight</h2>
      <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Sparkles className="h-6 w-6 text-purple-400 flex-shrink-0 mt-1" />
            <p className="text-white text-lg leading-relaxed">{text}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}









































