import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Imap = require("imap-simple");
import { simpleParser } from "mailparser";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

export async function POST(req: Request) {
  try {
    const imapConfig = {
      imap: {
        user: process.env.IMAP_USER as string,
        password: process.env.IMAP_PASS as string,
        host: process.env.IMAP_HOST as string,
        port: parseInt(process.env.IMAP_PORT as string, 10),
        tls: true,
        authTimeout: 5000,
      },
    };

    const connection = await Imap.connect(imapConfig);
    await connection.openBox("INBOX");

    const searchCriteria = ["UNSEEN"]; // unread messages
    const fetchOptions = { bodies: [""], markSeen: true };

    const messages = await connection.search(searchCriteria, fetchOptions);

    for (const msg of messages) {
      const all = msg.parts?.find((p: any) => p.which === "");
      if (!all || !all.body) continue;

      const parsed = await simpleParser(all.body);

      const fromEmail = parsed.from?.value?.[0]?.address || "";
      const subject = parsed.subject || "";
      const body = parsed.text || "";

      if (!fromEmail) continue;

      const { data: contact } = await supabase
        .from("contacts")
        .select("id")
        .eq("email", fromEmail)
        .single();

      if (contact) {
        const { data: cc } = await supabase
          .from("campaign_contacts")
          .select("id")
          .eq("contact_id", contact.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (cc) {
          const { data: insertedReply } = await supabase.from("email_replies").insert([
            {
              campaign_contact_id: cc.id,
              from_email: fromEmail,
              subject,
              body,
            },
          ]).select('id').single();

          // Trigger AI reply detection
          if (insertedReply?.id && body) {
            try {
              await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-reply-detect`, {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                },
                body: JSON.stringify({ 
                  emailId: insertedReply.id, 
                  body: body 
                }),
              });
            } catch (e) {
              console.error("Failed to trigger AI reply detection:", e);
            }
          }

          try {
            // Stop any active sequence run for this contact on reply
            await supabase
              .from("sequence_runs")
              .update({ stopped: true })
              .eq("contact_id", contact.id)
              .eq("stopped", false);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Failed to stop sequence_runs on reply:", e);
          }
        }
      }
    }

    connection.end();
    return NextResponse.json({ success: true, message: "Replies fetched" });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("Reply fetch error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
} 