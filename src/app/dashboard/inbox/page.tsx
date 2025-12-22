import { redirect } from "next/navigation";

export default function InboxPage() {
  // Block 269300 — SmartSend Standardization Sprint
  // Inbox lives at /inbox. Keep one canonical inbox UI.
  redirect("/inbox");
}
