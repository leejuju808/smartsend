"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Using div with overflow instead of ScrollArea component
import { Badge } from "@/components/ui/badge";

interface SequenceDiffViewerProps {
  diff: {
    before?: any;
    after?: any;
    version1_id?: string;
    version2_id?: string;
    error?: string;
  } | null;
}

export function SequenceDiffViewer({ diff }: SequenceDiffViewerProps) {
  if (!diff) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Diff Viewer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Select two versions to compare
          </div>
        </CardContent>
      </Card>
    );
  }

  if (diff.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Diff Viewer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-500">Error: {diff.error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Version Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[500px] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">Before</Badge>
                {diff.version1_id && (
                  <span className="text-xs text-muted-foreground">
                    {diff.version1_id.substring(0, 8)}...
                  </span>
                )}
              </div>
              <div className="border rounded p-3 bg-red-50 dark:bg-red-950/20">
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(diff.before, null, 2)}
                </pre>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default">After</Badge>
                {diff.version2_id && (
                  <span className="text-xs text-muted-foreground">
                    {diff.version2_id.substring(0, 8)}...
                  </span>
                )}
              </div>
              <div className="border rounded p-3 bg-green-50 dark:bg-green-950/20">
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(diff.after, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

