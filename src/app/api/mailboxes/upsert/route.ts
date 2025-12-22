import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<any>({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      id,
      name,
      from_email,
      from_name,
      smtp_host,
      smtp_port,
      smtp_username,
      smtp_password,
      daily_cap,
      is_active
    } = body;

    // Validate required fields
    if (!name || !from_email || !daily_cap) {
      return NextResponse.json({ 
        error: "Missing required fields: name, from_email, daily_cap" 
      }, { status: 400 });
    }

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .single();

    const workspaceId = profile?.workspace_id;

    const mailboxData: any = {
      name,
      from_email: from_email.toLowerCase(),
      from_name,
      smtp_host,
      smtp_port: smtp_port ? parseInt(smtp_port) : null,
      smtp_username,
      smtp_password,
      daily_cap: parseInt(daily_cap),
      is_active: is_active !== undefined ? is_active : true,
      user_id: user.id,
      workspace_id: workspaceId,
      updated_at: new Date().toISOString()
    };

    let result;
    if (id) {
      // Update existing mailbox
      const { data, error } = await supabase
        .from("mailboxes")
        .update(mailboxData)
        .eq("id", id)
        .eq("user_id", user.id) // Ensure user owns the mailbox
        .select()
        .single();

      if (error) {
        console.error("Error updating mailbox:", error);
        return NextResponse.json({ error: "Failed to update mailbox" }, { status: 500 });
      }
      result = data;
    } else {
      // Create new mailbox
      mailboxData.created_at = new Date().toISOString();
      
      const { data, error } = await supabase
        .from("mailboxes")
        .insert(mailboxData)
        .select()
        .single();

      if (error) {
        console.error("Error creating mailbox:", error);
        return NextResponse.json({ error: "Failed to create mailbox" }, { status: 500 });
      }
      result = data;
    }

    return NextResponse.json({
      success: true,
      mailbox: result
    });

  } catch (error) {
    console.error("Error in mailbox upsert:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 