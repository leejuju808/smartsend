"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Using div with overflow instead of ScrollArea component
import { Badge } from "@/components/ui/badge";
import { Clock, User } from "lucide-react";

interface Version {
  id: string;
  created_at: string;
  editor_id: string;
  change_type: string;
  snapshot: any;
}

interface SequenceVersionHistoryProps {
  sequenceId: string;
  onSelect?: (version: Version) => void;
  onRevert?: (version: Version) => void;
  campaignId?: string;
}

export function SequenceVersionHistory({
  sequenceId,
  onSelect,
  onRevert,
  campaignId,
}: SequenceVersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sequences/${sequenceId}/versions`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setVersions(d.versions || []);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [sequenceId]);

  const handleRevert = async (version: Version) => {
    if (!confirm("Are you sure you want to revert to this version? This will overwrite the current sequence.")) {
      return;
    }

    try {
      const response = await fetch(`/api/sequences/${sequenceId}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id, campaignId }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Error: ${data.error || "Failed to revert"}`);
        return;
      }

      alert("Sequence reverted successfully!");
      if (onRevert) {
        onRevert(version);
      }
      // Refresh versions list
      window.location.reload();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Version History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Version History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-500">Error: {error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Version History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] overflow-y-auto">
          <div className="space-y-2">
            {versions.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No versions yet
              </div>
            ) : (
              versions.map((v, idx) => (
                <div
                  key={v.id}
                  className="border rounded-lg p-3 space-y-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={idx === 0 ? "default" : "secondary"}>
                          {idx === 0 ? "Latest" : `v${versions.length - idx}`}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {v.change_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(v.created_at).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        {v.editor_id.substring(0, 8)}...
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {onSelect && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onSelect(v)}
                        >
                          View
                        </Button>
                      )}
                      {onRevert && idx !== 0 && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRevert(v)}
                        >
                          Revert
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

