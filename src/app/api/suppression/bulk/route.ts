import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { emails, reason, workspaceId } = await req.json();

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: "emails must be a non-empty array" }, { status: 400 });
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Set workspace context for RLS
    await supabase.rpc('app.set_workspace', { workspace_id: workspaceId });

    // Normalize emails and prepare for insertion
    const suppressionRecords = emails.map((email: string) => ({
      workspace_id: workspaceId,
      email: email.trim().toLowerCase(),
      reason: reason || 'bulk_import',
      source: 'bulk_import',
      created_at: new Date().toISOString()
    }));

    // Insert in batches to avoid hitting limits
    const batchSize = 1000;
    let inserted = 0;
    let duplicates = 0;

    for (let i = 0; i < suppressionRecords.length; i += batchSize) {
      const batch = suppressionRecords.slice(i, i + batchSize);
      
      const { error, count } = await supabase
        .from('suppression_emails')
        .upsert(batch, { 
          onConflict: 'workspace_id,email',
          count: 'exact'
        });

      if (error) {
        console.error('Batch suppression insert error:', error);
        return NextResponse.json({ 
          error: `Failed to insert batch: ${error.message}` 
        }, { status: 500 });
      }

      inserted += count || batch.length;
    }

    // Count actual duplicates (emails that already existed)
    const { data: existingData, error: countError } = await supabase
      .from('suppression_emails')
      .select('email')
      .eq('workspace_id', workspaceId)
      .in('email', emails.map(e => e.trim().toLowerCase()));

    if (countError) {
      console.error('Error counting existing suppressions:', countError);
    } else {
      duplicates = (existingData || []).length;
    }

    return NextResponse.json({
      success: true,
      summary: {
        requested: emails.length,
        inserted: inserted,
        duplicates: duplicates,
        total: existingData ? existingData.length : inserted
      }
    });

  } catch (error: any) {
    console.error('Bulk suppression error:', error);
    return NextResponse.json({ 
      error: error?.message || "Bulk suppression failed" 
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Set workspace context for RLS
    await supabase.rpc('app.set_workspace', { workspace_id: workspaceId });

    const { data, error } = await supabase
      .from('suppression_emails')
      .select('email, reason, source, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      suppressions: data || [],
      total: data ? data.length : 0
    });

  } catch (error: any) {
    console.error('Get suppressions error:', error);
    return NextResponse.json({ 
      error: error?.message || "Failed to fetch suppressions" 
    }, { status: 500 });
  }
} 