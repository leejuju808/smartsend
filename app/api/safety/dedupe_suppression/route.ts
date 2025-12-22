import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/safety/dedupe_suppression
 * 
 * SmartSend Safety Net v1 - Deduplicate Suppression List
 * Removes duplicate entries and consolidates suppression reasons
 * Can be called manually or via cron job
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json().catch(() => ({}));
    const { workspace_id } = body;

    if (workspace_id) {
      // Dedupe for specific workspace
      // Find duplicates (same email, multiple entries)
      const { data: duplicates, error: findError } = await supabase
        .from('suppression_list')
        .select('email, id, reason, created_at')
        .eq('workspace_id', workspace_id)
        .order('created_at', { ascending: true });

      if (findError) {
        return NextResponse.json(
          { ok: false, error: findError.message },
          { status: 500 }
        );
      }

      // Group by email and keep earliest entry
      const emailMap = new Map<string, any>();
      const toDelete: string[] = [];

      for (const entry of duplicates || []) {
        const emailLower = entry.email.toLowerCase();
        if (!emailMap.has(emailLower)) {
          emailMap.set(emailLower, entry);
        } else {
          // Keep earliest, delete others
          const existing = emailMap.get(emailLower);
          if (new Date(entry.created_at) < new Date(existing.created_at)) {
            toDelete.push(existing.id);
            emailMap.set(emailLower, entry);
          } else {
            toDelete.push(entry.id);
          }
        }
      }

      // Delete duplicates
      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('suppression_list')
          .delete()
          .in('id', toDelete);

        if (deleteError) {
          return NextResponse.json(
            { ok: false, error: deleteError.message },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        ok: true,
        workspace_id,
        removed_duplicates: toDelete.length,
        message: `Removed ${toDelete.length} duplicate suppression(s)`
      });
    } else {
      // Dedupe all workspaces (for cron job)
      // Get all workspaces and process each
      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id');

      let totalRemoved = 0;
      for (const ws of workspaces || []) {
        // Recursive call for each workspace
        const response = await fetch(`${req.nextUrl.origin}/api/safety/dedupe_suppression`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace_id: ws.id })
        });
        const result = await response.json();
        if (result.ok) {
          totalRemoved += result.removed_duplicates || 0;
        }
      }

      return NextResponse.json({
        ok: true,
        removed_duplicates: totalRemoved,
        message: `Deduplicated suppression lists across all workspaces, removed ${totalRemoved} duplicates`
      });
    }
  } catch (error: any) {
    console.error('Dedupe suppression error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















































