"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface VariantSelectorProps {
  variants: string[];
  onApply: (variant: string) => void;
}

export function VariantSelector({ variants, onApply }: VariantSelectorProps) {
  const labels = ["Version A (Professional)", "Version B (Casual)", "Version C (High Personalization)"];

  return (
    <div className="space-y-3 mt-4">
      <h4 className="font-semibold text-white">Choose a variant:</h4>
      {variants.map((v, i) => (
        <Card key={i} className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-xs font-medium text-zinc-400 mb-2">{labels[i] || `Variant ${i + 1}`}</p>
                <p className="text-sm text-white whitespace-pre-wrap">{v}</p>
              </div>
            </div>
            <Button
              onClick={() => onApply(v)}
              className="w-full bg-yellow-400 text-black hover:bg-yellow-500"
              size="sm"
            >
              Use This Version
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}










