// supabase/functions/execute_send/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { taskId } = await req.json();
    if (!taskId) {
      return new Response(JSON.stringify({ error: "Missing taskId" }), { status: 400 });
    }

    // Get the task from the queue
    const { data: task, error: fetchError } = await supabase
      .from("send_queue")
      .select("*")
      .eq("id", taskId)
      .single();

    if (fetchError || !task) {
      return new Response(JSON.stringify({ error: "Task not found" }), { status: 404 });
    }

    // Send the email (simple example — replace with your email API)
    const emailBody = {
      to: task.recipient,
      subject: task.subject,
      html: task.body,
    };

    // Example send using Resend API
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailBody),
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`Email send failed: ${msg}`);
    }

    // Mark as sent
    await supabase
      .from("send_queue")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", taskId);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("Execution error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});