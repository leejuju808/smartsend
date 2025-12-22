import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Configure SMTP (use your provider's SMTP creds)
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST!,
  port: Number(process.env.SMTP_PORT || "587"),
  secure: false, // true if port 465
  auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
});

export async function sendDue(limit = 25) {
  // lock & fetch due items
  const { data: jobs, error } = await supabase
    .from("send_queue")
    .select("*")
    .eq("status", "queued")
    .lte("scheduled_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!jobs || jobs.length === 0) return { sent: 0 };

  let sent = 0;
  for (const j of jobs) {
    try {
      await supabase.from("send_queue").update({ status: "sending" }).eq("id", j.id);

      await transporter.sendMail({
        from: process.env.MAIL_FROM || "SmartSend <no-reply@yourdomain.com>",
        to: j.to_email,
        subject: j.subject,
        html: j.body_html,
      });

      await supabase.from("send_queue").update({ status: "sent" }).eq("id", j.id);

      // optional: bump deliveries counter for the campaign
      await supabase.rpc("inc_deliveries", { p_campaign_id: j.campaign_id }).catch(()=>{});
      sent++;
      // basic throttling to respect limits
      await new Promise(r => setTimeout(r, Number(process.env.SEND_THROTTLE_MS || "150")));
    } catch (e:any) {
      await supabase.from("send_queue").update({ status: "failed" }).eq("id", j.id);
    }
  }
  return { sent };
}