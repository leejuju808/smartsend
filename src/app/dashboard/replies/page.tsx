import { redirect } from "next/navigation";

export default function RepliesPage() {
  // Block 269300 — SmartSend Standardization Sprint
  // Replies live in one place. No alternates.
  redirect("/inbox");
}
