import crypto from "crypto";
import { validateEmail } from "@/lib/util/validateEmail";

export type MessageType = "estimate" | "followup" | "outreach" | "proposal";

export function computeSendIdempotencyKey(params: {
  relatedId: string;
  messageType: MessageType;
  stepNumber: number;
}) {
  const input = `${params.relatedId}:${params.messageType}:${params.stepNumber}`;
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function assertValidRecipientEmail(email: string) {
  const norm = String(email || "").trim().toLowerCase();
  if (!norm || !validateEmail(norm) || norm.length > 254) {
    return { ok: false as const, email: norm };
  }
  return { ok: true as const, email: norm };
}










