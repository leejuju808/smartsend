import { randomBytes } from "crypto";

export function newTrackingKey() {
  return randomBytes(16).toString("hex");
}

