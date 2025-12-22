"use client";

import useSWR from "swr";
import { useTransition } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type SuppressionResponse = {
  emails: Array<{
    email: string;
    reason: string;
    created_at: string;
    expires_at: string | null;
  }>;
  domains: Array<{
    domain: string;
    reason: string;
    created_at: string;
    expires_at: string | null;
  }>;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function SuppressionsTable() {
  const { data, mutate, isLoading } = useSWR<SuppressionResponse>(
    "/api/suppressions",
    (u) => fetch(u).then((r) => r.json()),
  );
  const [isPending, startTransition] = useTransition();

  const removeSuppression = (payload: { email?: string; domain?: string }) => {
    startTransition(async () => {
      await fetch("/api/suppressions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      mutate();
    });
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Suppressions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        )}

        {!isLoading && (
          <>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Emails
              </h3>
              <div className="space-y-2">
                {(data?.emails ?? []).map((item) => (
                  <div
                    key={`email-${item.email}`}
                    className="flex items-center justify-between gap-4 rounded-md border border-border/40 p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{item.email}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {formatDate(item.created_at)} · Expires{" "}
                        {formatDate(item.expires_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{item.reason}</Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => removeSuppression({ email: item.email })}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                {(data?.emails?.length ?? 0) === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No suppressed emails.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Domains
              </h3>
              <div className="space-y-2">
                {(data?.domains ?? []).map((item) => (
                  <div
                    key={`domain-${item.domain}`}
                    className="flex items-center justify-between gap-4 rounded-md border border-border/40 p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">{item.domain}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {formatDate(item.created_at)} · Expires{" "}
                        {formatDate(item.expires_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{item.reason}</Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() =>
                          removeSuppression({ domain: item.domain })}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                {(data?.domains?.length ?? 0) === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No suppressed domains.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}



