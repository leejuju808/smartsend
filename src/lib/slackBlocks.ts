export function lowCreditsBlocks(balance: number) {
  const buy200 = `${process.env.NEXT_PUBLIC_SITE_URL}/api/billing/topup/deeplink?pack=200`;
  return [
    { type: "section", text: { type: "mrkdwn", text: `:warning: *Credits low* — ${balance} left.` } },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Buy 200 now" }, url: buy200, style: "primary" },
        { type: "button", text: { type: "plain_text", text: "Open Billing" }, url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing` }
      ]
    }
  ];
}

export function meetingBookedBlocks(subject: string) {
  return [
    { type: "section", text: { type: "mrkdwn", text: `:tada: *Meeting booked!* \n*Subject:* ${subject}` } },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Open Thread" }, url: `${process.env.NEXT_PUBLIC_SITE_URL}/threads` },
        { type: "button", text: { type: "plain_text", text: "Add Seats" }, url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/team` }
      ]
    }
  ];
}

export function leaderboardBlocks(lines: string[]) {
  return [
    { type: "header", text: { type: "plain_text", text: "SmartSendAI — Weekly Leaderboard" } },
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") || "_No activity yet._" } },
    { 
      type: "actions", 
      elements: [
        { type: "button", text: { type: "plain_text", text: "Add Seats" }, url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/team`, style: "primary" },
        { type: "button", text: { type: "plain_text", text: "View ROI" }, url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard` }
      ] 
    }
  ];
}

export function promoBlocks(percent = 20, minutesLeft = 30, promoCodeId?: string) {
  const annual = `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?plan=annual&promo=${promoCodeId || ""}`;
  const monthly = `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?plan=monthly&promo=${promoCodeId || ""}`;
  return [
    { type: "section", text: { type: "mrkdwn", text: `:fire: *${percent}% off ends in ${minutesLeft}m*` } },
    { type: "context", elements: [{ type: "mrkdwn", text: "Unlock higher reply limits + full extension access." }] },
    { 
      type: "actions", 
      elements: [
        { type: "button", text: { type: "plain_text", text: "Upgrade Annual" }, url: annual, style: "primary" },
        { type: "button", text: { type: "plain_text", text: "Upgrade Monthly" }, url: monthly }
      ] 
    }
  ];
}

export function insertMeetingBlocks() {
  return [
    { type: "section", text: { type: "mrkdwn", text: "*Insert meeting options?*" } },
    {
      type: "actions",
      elements: [
        // server-generated snippet via interactions endpoint
        { type: "button", text: { type: "plain_text", text: "Insert 30-min Snippet" }, action_id: "insert_meeting_snippet", value: "30" },
        // straight link to Calendly
        { type: "button", text: { type: "plain_text", text: "Open Calendly" }, url: process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com" }
      ]
    }
  ];
} 