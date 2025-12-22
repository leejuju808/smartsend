import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";

type PageProps = {
  params: {
    token: string;
  };
};

export default async function UnsubscribePage({ params }: PageProps) {
  const { token } = params;

  const supabase = createClient();
  const hdrs = headers();

  const ipHeader = hdrs.get("x-forwarded-for");
  const ip = ipHeader ? ipHeader.split(",")[0].trim() : null;
  const userAgent = hdrs.get("user-agent") ?? null;

  const { data, error } = await supabase.rpc("unsubscribe_by_token", {
    p_token: token,
    p_ip: ip,
    p_user_agent: userAgent,
  });

  type RpcResult = {
    status: string;
    reason?: string;
    email?: string;
    workspace_id?: string;
    already_unsubscribed?: boolean;
  };

  const result = (data || {}) as RpcResult;

  let state: "invalid" | "unsubscribed" | "already" = "invalid";
  let email: string | undefined;

  if (!error && result.status === "ok") {
    email = result.email;
    state = result.already_unsubscribed ? "already" : "unsubscribed";
  } else if (
    result.status === "error" &&
    result.reason === "invalid_token"
  ) {
    state = "invalid";
  } else if (error) {
    state = "invalid";
  }

  const title =
    state === "unsubscribed"
      ? "You've been unsubscribed"
      : state === "already"
      ? "You're already unsubscribed"
      : "This unsubscribe link is not valid";

  const description =
    state === "unsubscribed"
      ? email
        ? `You will no longer receive emails from this sender at ${email}.`
        : "You will no longer receive emails from this sender."
      : state === "already"
      ? email
        ? `You were already unsubscribed for ${email}.`
        : "You were already unsubscribed for this sender."
      : "This unsubscribe link may have expired or is incorrect.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full shadow-lg border border-border">
        <CardHeader className="flex flex-col items-center gap-3 text-center pt-8 pb-4">
          {state === "invalid" ? (
            <XCircle className="h-10 w-10 text-destructive" />
          ) : (
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          )}
          <h1 className="text-xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="pb-8 pt-2 text-center text-xs text-muted-foreground">
          <p>
            If this was a mistake, you can reach out directly to the sender
            to resubscribe or update your email preferences.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}















