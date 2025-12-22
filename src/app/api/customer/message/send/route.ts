// Block 243000 — SmartSend Roofing CX Hub
// POST /api/customer/message/send
// Send a message from customer or company

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { homeowner_id, job_id, company_id, sender, message, sender_name, sender_email } = body;

    if (!job_id || !sender || !message) {
      return NextResponse.json(
        { error: "job_id, sender, and message are required" },
        { status: 400 }
      );
    }

    // Validate sender
    if (!["customer", "company"].includes(sender)) {
      return NextResponse.json(
        { error: "sender must be 'customer' or 'company'" },
        { status: 400 }
      );
    }

    // Insert message
    const { data: newMessage, error: insertError } = await supabase
      .from("customer_messages")
      .insert({
        homeowner_id: homeowner_id || null,
        job_id,
        company_id: company_id || null,
        sender: sender,
        sender_type: sender, // For compatibility
        sender_name: sender_name || null,
        sender_email: sender_email || null,
        message,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting message:", insertError);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    // Analyze sentiment if from customer
    if (sender === "customer" && newMessage.id) {
      try {
        const { data: sentiment } = await supabase.rpc("analyze_customer_sentiment", {
          p_message_id: newMessage.id,
        });
        
        // If negative sentiment, could trigger alert to office
        if (sentiment?.sentiment === "negative") {
          // In production, this would create a task or notification for office staff
          console.log("Negative sentiment detected:", sentiment);
        }
      } catch (e) {
        // Sentiment analysis is optional
      }
    }

    // Create notification for recipient
    if (sender === "customer") {
      // Notify company
      await supabase.from("customer_notifications").insert({
        homeowner_id,
        job_id,
        event_type: "photos_uploaded", // Reuse event type
        title: "New Message",
        body: `You have a new message from ${sender_name || "customer"}`,
        metadata: {
          type: "message",
          message_id: newMessage.id,
        },
      });
    } else {
      // Notify customer
      await supabase.from("customer_notifications").insert({
        homeowner_id,
        job_id,
        event_type: "photos_uploaded", // Reuse event type
        title: "New Message",
        body: `You have a new message from ${sender_name || "the company"}`,
        read: false,
        metadata: {
          type: "message",
          message_id: newMessage.id,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      message: newMessage,
    });
  } catch (error: any) {
    console.error("Error in send message API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























