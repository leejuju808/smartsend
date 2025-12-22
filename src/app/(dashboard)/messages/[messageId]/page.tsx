import ReplyIntentBanner from "@/components/reply-intent/ReplyIntentBanner";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fetch message from your data source
async function getMessage(messageId: string) {
  // Try to fetch from email_replies or inbound_messages table
  const { data, error } = await supabase
    .from("email_replies")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();

  if (error || !data) {
    // Fallback to mock data for demonstration
    return {
      id: messageId,
      from_email: "lead@example.com",
      from_name: "Prospect",
      body_text: "Hey, yes let's talk. Are you free tomorrow morning?",
    };
  }

  return {
    id: data.id,
    from_email: data.from_email || "unknown@example.com",
    from_name: data.from_name || "Unknown",
    body_text: data.body_text || data.reply_text || "",
  };
}

export default async function MessagePage({ params }: { params: { messageId: string } }) {
  const msg = await getMessage(params.messageId);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Message Details</h1>
      
      <ReplyIntentBanner
        messageId={msg.id}
        senderEmail={msg.from_email}
        senderName={msg.from_name}
        bodyText={msg.body_text}
      />
      
      <div className="rounded-2xl border p-4">
        <div className="text-sm text-muted-foreground mb-2">
          From: {msg.from_name} &lt;{msg.from_email}&gt;
        </div>
        <pre className="whitespace-pre-wrap text-sm">{msg.body_text}</pre>
      </div>
    </div>
  );
}
