// Block 451 — Inbox Warmup v2: AI Warmup Content Generator
// Generates human-looking warmup emails with variations

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface WarmupContent {
  subject: string;
  body: string;
  thread_context?: string;
}

Deno.serve(async (req) => {
  try {
    const { inbox_id, target_inbox_id, is_reply = false, thread_id } = await req.json();

    if (!inbox_id || !target_inbox_id) {
      return new Response(
        JSON.stringify({ error: "inbox_id and target_inbox_id are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get inbox details for personalization
    const { data: inbox } = await supabase
      .from("sender_inboxes")
      .select("email, display_name")
      .eq("id", inbox_id)
      .single();

    const { data: targetInbox } = await supabase
      .from("sender_inboxes")
      .select("email, display_name")
      .eq("id", target_inbox_id)
      .single();

    // Check if this is a reply to existing thread
    let threadContext = null;
    if (is_reply && thread_id) {
      const { data: thread } = await supabase
        .from("warmup_queue")
        .select("subject, body")
        .eq("id", thread_id)
        .single();
      
      if (thread) {
        threadContext = thread.body;
      }
    }

    const content = generateWarmupContent(inbox, targetInbox, is_reply, threadContext);

    return new Response(
      JSON.stringify({ ok: true, content }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in warmup-content-generator:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function generateWarmupContent(
  inbox: any,
  targetInbox: any,
  isReply: boolean,
  threadContext: string | null
): WarmupContent {
  if (isReply && threadContext) {
    return generateReply(threadContext);
  } else {
    return generateInitialEmail();
  }
}

function generateInitialEmail(): WarmupContent {
  const subjects = [
    "Quick Question",
    "Checking In",
    "Following Up",
    "Thanks!",
    "Hello Again",
    "Just Following Up",
    "Quick Check-In",
    "Hope You're Well",
    "Touching Base",
    "Quick Update",
    "Catching Up",
    "Just Reaching Out",
    "Hope All Is Well",
    "Quick Note",
    "Checking In With You",
  ];

  const bodies = [
    "Hope you're having a great day!",
    "Just wanted to touch base quickly.",
    "Thanks for staying in touch.",
    "Hope all is well on your end.",
    "Appreciate you keeping the conversation going.",
    "Looking forward to hearing from you soon.",
    "Hope you're doing great!",
    "Just checking in to keep this thread active.",
    "Thanks for your time.",
    "Appreciate the quick follow-up!",
    "Hope everything is going well.",
    "Just wanted to say hello.",
    "Thanks for keeping in touch.",
    "Hope you're having a productive week.",
    "Just a quick note to stay connected.",
  ];

  // Randomize length
  const bodyCount = Math.floor(Math.random() * 2) + 1; // 1-2 sentences
  const selectedBodies = [];
  for (let i = 0; i < bodyCount; i++) {
    const randomBody = bodies[Math.floor(Math.random() * bodies.length)];
    if (!selectedBodies.includes(randomBody)) {
      selectedBodies.push(randomBody);
    }
  }

  return {
    subject: subjects[Math.floor(Math.random() * subjects.length)],
    body: selectedBodies.join(" "),
  };
}

function generateReply(threadContext: string): WarmupContent {
  const replySubjects = [
    "Re:",
    "Re: Quick Question",
    "Re: Following Up",
    "Re: Checking In",
  ];

  const replyBodies = [
    "Thanks!",
    "Sounds good!",
    "Appreciate it!",
    "Perfect, thanks!",
    "Got it, thanks!",
    "Sounds great!",
    "Thanks for the update!",
    "Appreciate the follow-up!",
    "Thanks for getting back to me!",
    "Sounds good, thanks!",
    "Perfect!",
    "Thanks so much!",
    "Appreciate it, thanks!",
    "Got it, appreciate it!",
    "Thanks for letting me know!",
  ];

  // Sometimes include thread context
  const includeContext = Math.random() > 0.5;
  let body = replyBodies[Math.floor(Math.random() * replyBodies.length)];
  
  if (includeContext && threadContext) {
    const contextSnippets = [
      `Regarding your note about "${threadContext.substring(0, 30)}..."`,
      `About what you mentioned earlier,`,
      `Regarding that,`,
    ];
    body = `${contextSnippets[Math.floor(Math.random() * contextSnippets.length)]} ${body}`;
  }

  return {
    subject: replySubjects[Math.floor(Math.random() * replySubjects.length)],
    body,
    thread_context: threadContext,
  };
}



