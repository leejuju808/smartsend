// Block 20710 — Proposal Panel (from Blocks 20520 + 20560)

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { FileText, Copy, Check, Mail, Clock } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

interface ProposalPanelProps {
  data: {
    id: string | null;
    created: string | null;
    sent: string | null;
    text: string | null;
    data: any;
    status: string | null;
    emailSends: any[];
  };
  onCopy: (text: string, type: string) => void;
  copied: string | null;
}

export function ProposalPanel({ data, onCopy, copied }: ProposalPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!data.id && !data.text) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Proposal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No proposal created yet</p>
        </CardContent>
      </Card>
    );
  }

  const handleCopy = () => {
    if (data.text) {
      onCopy(data.text, "proposal");
    }
  };

  const handleResend = () => {
    // TODO: Implement resend proposal
    console.log("Resend proposal clicked");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Proposal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Proposal Status */}
        {data.status && (
          <div className="flex items-center justify-between">
            <Badge variant="outline">{data.status}</Badge>
            {data.sent && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Sent {format(new Date(data.sent), "MMM d, yyyy")}
              </div>
            )}
          </div>
        )}

        {/* Proposal Created Date */}
        {data.created && (
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Created: {format(new Date(data.created), "MMM d, yyyy 'at' h:mm a")}
          </div>
        )}

        {/* Proposal Sent Date */}
        {data.sent && (
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Mail className="h-3 w-3" />
            Sent: {format(new Date(data.sent), "MMM d, yyyy 'at' h:mm a")}
          </div>
        )}

        {/* Email Tracking */}
        {data.emailSends && data.emailSends.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground mb-2">
              Email Tracking: {data.emailSends.filter((s: any) => s.status === "sent").length} sent
              {data.emailSends.some((s: any) => s.opened_at) && 
                `, ${data.emailSends.filter((s: any) => s.opened_at).length} opened`}
            </div>
          </div>
        )}

        {/* Proposal Text */}
        {data.text && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Proposal Text</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="text-xs"
              >
                {expanded ? "Collapse" : "Expand"}
              </Button>
            </div>
            <div
              className={`text-sm text-muted-foreground ${
                expanded ? "" : "line-clamp-3"
              }`}
            >
              {data.text}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResend}
            className="flex items-center gap-2"
          >
            <Mail className="h-4 w-4" />
            Resend Proposal
          </Button>
          {data.text && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="flex items-center gap-2"
            >
              {copied === "proposal" ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
















































