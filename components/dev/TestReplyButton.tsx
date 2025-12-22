"use client";

import { Button } from "@/components/ui/button";

export function TestReplyButton() {
  const fire = async () => {
    const res = await fetch("/api/webhooks/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-provider": "dev"
      },
      body: JSON.stringify({
        from_email: "prospect@example.com",
        to_email: "inbox@smartsend.app",
        subject: "Re: Quick question",
        body: "Hey—sounds good, can you call me tomorrow?",
        thread_id: "dev-123"
      })
    });
    console.log(await res.json());
  };
  return <Button onClick={fire}>Simulate Reply</Button>;
}


