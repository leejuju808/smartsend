// Block 140000 — SmartSend Roofing Website Widget
// API: Send message and process chat flow
// POST /api/widget/message

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertUnifiedMessage } from "@/lib/unified-messages";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { session_token, message } = await req.json();

    if (!session_token || !message) {
      return NextResponse.json(
        { error: "session_token and message are required" },
        { status: 400 }
      );
    }

    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get session
    const { data: session, error: sessionError } = await supabase
      .from("webchat_sessions")
      .select("*")
      .eq("session_token", session_token)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.step >= 99) {
      return NextResponse.json(
        { error: "Session already completed" },
        { status: 400 }
      );
    }

    // Save visitor message
    const { error: messageError } = await supabase
      .from("webchat_messages")
      .insert({
        session_id: session.id,
        sender: "visitor",
        message: message.trim(),
      });

    if (messageError) {
      console.error("Failed to save message:", messageError);
    }

    // Block 150000: Insert visitor message into unified messages table
    try {
      const visitorName = session.collected_data?.name || "Website Visitor";
      const leadId = session.created_lead_id || null;

      await insertUnifiedMessage({
        company_id: session.roofing_company_id,
        lead_id: leadId,
        channel: "widget",
        direction: "incoming",
        sender: visitorName,
        body: message.trim(),
        metadata: {
          session_id: session.id,
          session_token: session.session_token,
          step: session.step,
        },
      });
    } catch (unifiedError) {
      console.warn("Failed to insert unified message for widget visitor:", unifiedError);
    }

    // Process based on current step
    const currentStep = session.step;
    const collectedData = session.collected_data || {};
    let nextStep = currentStep;
    let botMessage = "";
    let complete = false;

    // Update collected data based on step
    switch (currentStep) {
      case 1: // Name
        collectedData.name = message.trim();
        nextStep = 2;
        botMessage = "Got it! How can we reach you? (Phone number or email)";
        break;

      case 2: // Contact
        collectedData.contact = message.trim();
        nextStep = 3;
        botMessage = "Perfect! What's your address or ZIP code?";
        break;

      case 3: // Address/ZIP
        collectedData.address = message.trim();
        nextStep = 4;
        botMessage = "Thanks! Tell us what's going on with your roof:";
        break;

      case 4: // Problem
        collectedData.problem = message.trim();
        nextStep = 99;
        complete = true;
        botMessage = "Perfect! We have everything we need.";

        // Save bot message
        await supabase.from("webchat_messages").insert({
          session_id: session.id,
          sender: "bot",
          message: botMessage,
        });

        // Block 150000: Insert bot message into unified messages table (before lead creation)
        try {
          await insertUnifiedMessage({
            company_id: session.roofing_company_id,
            lead_id: null, // Will be updated after lead creation
            channel: "widget",
            direction: "outgoing",
            sender: "SmartSend Bot",
            body: botMessage,
            metadata: {
              session_id: session.id,
              session_token: session.session_token,
              step: 99,
            },
          });
        } catch (unifiedError) {
          console.warn("Failed to insert unified message for widget bot (complete):", unifiedError);
        }

        // Create lead
        try {
          const { data: leadId, error: leadError } = await supabase.rpc(
            "create_lead_from_webchat",
            { p_session_id: session.id }
          );

          if (leadError) {
            console.error("Failed to create lead:", leadError);
            // Continue anyway - we'll log the error
          } else {
            // Block 150000: Update unified messages with lead_id after lead creation
            try {
              await supabase
                .from("messages")
                .update({ lead_id: leadId })
                .eq("company_id", session.roofing_company_id)
                .eq("channel", "widget")
                .is("lead_id", null)
                .order("created_at", { ascending: false })
                .limit(10); // Update recent messages for this session
            } catch (updateError) {
              console.warn("Failed to update unified messages with lead_id:", updateError);
            }

            // Trigger notification (async, don't wait)
            fetch(`${req.nextUrl.origin}/api/widget/notify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session_id: session.id,
                lead_id: leadId,
              }),
            }).catch((err) => console.error("Notification error:", err));
          }
        } catch (error) {
          console.error("Error creating lead:", error);
        }

        break;

      default:
        botMessage = "Thanks for your message!";
    }

    // Update session
    await supabase
      .from("webchat_sessions")
      .update({
        step: nextStep,
        collected_data: collectedData,
        ...(complete ? { ended_at: new Date().toISOString() } : {}),
      })
      .eq("id", session.id);

    // Save bot message if not already saved
    if (botMessage && !complete) {
      await supabase.from("webchat_messages").insert({
        session_id: session.id,
        sender: "bot",
        message: botMessage,
      });

      // Block 150000: Insert bot message into unified messages table
      try {
        const leadId = session.created_lead_id || null;
        await insertUnifiedMessage({
          company_id: session.roofing_company_id,
          lead_id: leadId,
          channel: "widget",
          direction: "outgoing",
          sender: "SmartSend Bot",
          body: botMessage,
          metadata: {
            session_id: session.id,
            session_token: session.session_token,
            step: nextStep,
          },
        });
      } catch (unifiedError) {
        console.warn("Failed to insert unified message for widget bot:", unifiedError);
      }
    }

    return NextResponse.json({
      step: nextStep,
      bot_message: botMessage,
      complete,
    });
  } catch (error: any) {
    console.error("Error in /api/widget/message:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
