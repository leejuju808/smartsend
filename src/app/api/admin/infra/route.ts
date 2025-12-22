// app/api/admin/infra/route.ts
// Admin Infrastructure Monitoring API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";

const FOUNDER_EMAIL = "julian@smartsendhq.com";

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is founder/admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    if (profile?.email !== FOUNDER_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Use service role for admin queries
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get function logs (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data: functionLogs, error: logsError } = await adminSupabase
      .from("function_logs")
      .select("*")
      .gte("created_at", yesterday.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000);

    if (logsError) {
      console.error("Error fetching function logs:", logsError);
    }

    // Aggregate function stats
    const functionStats: Record<string, {
      total: number;
      success: number;
      failed: number;
      avgRuntime: number;
      lastRun?: string;
    }> = {};

    if (functionLogs) {
      for (const log of functionLogs) {
        if (!functionStats[log.fn_name]) {
          functionStats[log.fn_name] = {
            total: 0,
            success: 0,
            failed: 0,
            avgRuntime: 0,
          };
        }

        const stats = functionStats[log.fn_name];
        stats.total++;
        if (log.status === "ok") stats.success++;
        if (log.status === "error") stats.failed++;
        
        if (log.runtime_ms) {
          stats.avgRuntime = (stats.avgRuntime * (stats.total - 1) + log.runtime_ms) / stats.total;
        }

        if (!stats.lastRun || log.created_at > stats.lastRun) {
          stats.lastRun = log.created_at;
        }
      }
    }

    // Get send queue stats
    const { data: queueStats, error: queueError } = await adminSupabase
      .from("send_queue")
      .select("status")
      .gte("created_at", yesterday.toISOString());

    const queueCounts = {
      queued: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      total: queueStats?.length || 0,
    };

    if (queueStats) {
      for (const item of queueStats) {
        if (item.status === "queued") queueCounts.queued++;
        else if (item.status === "sending") queueCounts.sending++;
        else if (item.status === "sent") queueCounts.sent++;
        else if (item.status === "failed") queueCounts.failed++;
      }
    }

    // Calculate throughput (sends per hour)
    const { data: hourlySends, error: hourlyError } = await adminSupabase
      .from("send_queue")
      .select("created_at, status")
      .eq("status", "sent")
      .gte("created_at", yesterday.toISOString())
      .order("created_at", { ascending: true });

    const hourlyThroughput: Record<string, number> = {};
    if (hourlySends) {
      for (const send of hourlySends) {
        const hour = new Date(send.created_at).toISOString().slice(0, 13) + ":00:00";
        hourlyThroughput[hour] = (hourlyThroughput[hour] || 0) + 1;
      }
    }

    // Calculate average sends per hour
    const avgSendsPerHour = hourlySends?.length 
      ? Object.values(hourlyThroughput).reduce((a, b) => a + b, 0) / Object.keys(hourlyThroughput).length
      : 0;

    return NextResponse.json({
      queue: queueCounts,
      functions: functionStats,
      throughput: {
        hourly: hourlyThroughput,
        avg_per_hour: Math.round(avgSendsPerHour * 100) / 100,
        total_24h: queueCounts.sent,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error fetching infrastructure stats:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

