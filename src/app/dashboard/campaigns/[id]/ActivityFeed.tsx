"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

function Row({ log }: { log: any }) {
  const ts = new Date(log.created_at).toLocaleString();
  const who = log.actor?.email ?? "system";
  const target = log.target?.email ?? log.target_email ?? "";
  const role = (k: string) => log.meta?.[k];

  let text = "";
  switch (log.action) {
    case "share.add":
      text = `${who} added ${target} as ${role("role")}`;
      break;
    case "share.update":
      text = `${who} changed ${target} role ${role("role_from")} → ${role("role_to")}`;
      break;
    case "share.remove":
      text = `${who} removed ${target}`;
      break;
    case "invite.create":
      text = `${who} invited ${target} (${role("role")})`;
      break;
    case "invite.accept":
      text = `${target} accepted invite (${role("role")})`;
      break;
    case "invite.expire":
      text = `Invite for ${target} expired`;
      break;
    case "auto.cancel_followups":
      const reason = role("reason");
      if (reason === "duplicate") {
        const stepNo = role("step_no") ?? "N/A";
        const windowH = role("window_h") ?? 24;
        text = `Auto-canceled duplicate: step ${stepNo} was already sent within the last ${windowH} hours`;
      } else {
        text = `Auto-canceled followups: ${reason}`;
      }
      break;
    case "queue.skip_duplicate":
      const stepNoSkip = role("step_no") ?? "N/A";
      text = `Skipped duplicate step ${stepNoSkip} at enqueue time`;
      break;
    default:
      text = `${log.action}`;
  }

  return (
    <li className="py-2 border-b border-muted/30">
      <div className="text-sm">{text}</div>
      <div className="text-xs text-muted-foreground">{ts}</div>
    </li>
  );
}

export default function ActivityFeed({ campaignId }: { campaignId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let mounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(`
          id,
          action,
          created_at,
          target_email,
          target_user_id,
          meta,
          actor_id
        `)
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!mounted) return;

      if (error) {
        console.error("Error fetching audit logs:", error);
        setLoading(false);
        return;
      }

      // Get unique user IDs for actor and target
      const userIds = new Set<string>();
      data?.forEach((log: any) => {
        if (log.actor_id) userIds.add(log.actor_id);
        if (log.target_user_id) userIds.add(log.target_user_id);
      });

      // Fetch emails for users
      let emailMap = new Map<string, string>();
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", Array.from(userIds));

        profiles?.forEach((p: any) => {
          if (p.email) {
            emailMap.set(p.id, p.email);
          }
        });
      }

      // Format logs with actor and target emails
      const formattedLogs = data?.map((log: any) => ({
        ...log,
        actor: log.actor_id
          ? {
              id: log.actor_id,
              email: emailMap.get(log.actor_id) || null,
            }
          : null,
        target: log.target_user_id
          ? {
              id: log.target_user_id,
              email: emailMap.get(log.target_user_id) || null,
            }
          : null,
      })) ?? [];

      setLogs(formattedLogs);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`audit_logs:${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "audit_logs",
          filter: `campaign_id=eq.${campaignId}`,
        },
        async (payload) => {
          if (!mounted) return;

          const newLog = payload.new as any;

          // Fetch actor and target emails if needed
          const userIds = new Set<string>();
          if (newLog.actor_id) userIds.add(newLog.actor_id);
          if (newLog.target_user_id) userIds.add(newLog.target_user_id);

          let emailMap = new Map<string, string>();
          if (userIds.size > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, email")
              .in("id", Array.from(userIds));

            profiles?.forEach((p: any) => {
              if (p.email) {
                emailMap.set(p.id, p.email);
              }
            });
          }

          const formattedLog = {
            ...newLog,
            actor: newLog.actor_id
              ? {
                  id: newLog.actor_id,
                  email: emailMap.get(newLog.actor_id) || null,
                }
              : null,
            target: newLog.target_user_id
              ? {
                  id: newLog.target_user_id,
                  email: emailMap.get(newLog.target_user_id) || null,
                }
              : null,
          };

          setLogs((prev) => [formattedLog, ...prev]);
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading activity…</div>;
  }

  return (
    <div className="rounded-2xl border p-4">
      <h3 className="font-semibold mb-2">Activity</h3>
      <ul>
        {logs.map((l: any) => (
          <Row key={l.id} log={l} />
        ))}
      </ul>
      {logs.length === 0 && (
        <div className="text-sm text-muted-foreground">No activity yet.</div>
      )}
    </div>
  );
}

