"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface AISummaryBoxProps {
  summary: string;
}

export function AISummaryBox({ summary }: AISummaryBoxProps) {
  // Parse the summary to extract sections
  const parseSummary = (text: string) => {
    const bigWinMatch = text.match(/🔥\s*Big Win[:\s]+(.+?)(?=\n|⚠️|📌|$)/i);
    const concernMatch = text.match(/⚠️\s*Concern[:\s]+(.+?)(?=\n|📌|$)/i);
    const actionMatch = text.match(/📌\s*Action[:\s]+(.+?)(?=\n|$)/i);

    return {
      bigWin: bigWinMatch ? bigWinMatch[1].trim() : null,
      concern: concernMatch ? concernMatch[1].trim() : null,
      action: actionMatch ? actionMatch[1].trim() : null,
      raw: text,
    };
  };

  const parsed = parseSummary(summary);

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          <span>AI Pulse Summary</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          SmartSend AI analyzed your metrics and generated this summary
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {parsed.bigWin && (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-start gap-2">
                <span className="text-xl">🔥</span>
                <div>
                  <div className="font-semibold text-green-900 mb-1">Big Win</div>
                  <div className="text-sm text-green-800">{parsed.bigWin}</div>
                </div>
              </div>
            </div>
          )}

          {parsed.concern && (
            <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
              <div className="flex items-start gap-2">
                <span className="text-xl">⚠️</span>
                <div>
                  <div className="font-semibold text-yellow-900 mb-1">Concern</div>
                  <div className="text-sm text-yellow-800">{parsed.concern}</div>
                </div>
              </div>
            </div>
          )}

          {parsed.action && (
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-start gap-2">
                <span className="text-xl">📌</span>
                <div>
                  <div className="font-semibold text-blue-900 mb-1">Recommended Action</div>
                  <div className="text-sm text-blue-800">{parsed.action}</div>
                </div>
              </div>
            </div>
          )}

          {!parsed.bigWin && !parsed.concern && !parsed.action && (
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              {parsed.raw}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}









































