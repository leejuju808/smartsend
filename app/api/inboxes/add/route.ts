import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const authClient = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      domain_id,
      email,
      provider,
      oauth_token,
      smtp_config,
      daily_limit,
      warmup_enabled,
    } = body;

    if (!domain_id || !email || !provider) {
      return NextResponse.json(
        { error: "domain_id, email, and provider are required" },
        { status: 400 }
      );
    }

    if (!["gmail", "outlook", "smtp"].includes(provider)) {
      return NextResponse.json(
        { error: "Provider must be gmail, outlook, or smtp" },
        { status: 400 }
      );
    }

    // Verify domain belongs to user's workspace
    const { data: domain, error: domainError } = await authClient
      .from("sender_domains")
      .select("workspace_id")
      .eq("id", domain_id)
      .single();

    if (domainError || !domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // Verify user is member of workspace
    const { data: workspaceMember } = await authClient
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", domain.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Use service role for insert (in case oauth_token contains sensitive data)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from("sender_inboxes")
      .insert({
        workspace_id: domain.workspace_id,
        domain_id,
        email: email.toLowerCase().trim(),
        provider,
        oauth_token: oauth_token || null,
        smtp_config: smtp_config || null,
        daily_limit: daily_limit || 100,
        warmup_enabled: warmup_enabled || false,
        connected: !!(oauth_token || smtp_config),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Inbox already exists for this domain" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    console.error("Error adding inbox:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



