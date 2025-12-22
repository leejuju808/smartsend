import { createSupabaseServer } from "@/lib/supabaseServer";

export async function sendNotification(email: string, type: string, title: string, message: string) {
  const supabase = createSupabaseServer();

  await supabase.from("notifications").insert({
    user_email: email,
    type,
    title,
    message,
  });

  // Optional email alert via Resend
  if (process.env.RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "SmartSend <alerts@smartsend.ai>",
        to: email,
        subject: title,
        text: message
      })
    });
  }
}