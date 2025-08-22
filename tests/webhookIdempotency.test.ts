/**
 * tests/webhookIdempotency.test.ts
 * Ensures duplicate Stripe events are ignored and status mapping updates the profile.
 */
import { NextRequest } from "next/server";
import { POST as webhookHandler } from "../src/app/api/webhook/route";
import * as db from "../src/app/api/_lib/db";
import * as idem from "../src/app/api/_lib/idempotency";

jest.mock("../src/app/api/_lib/db", () => ({
  markEventProcessed: jest.fn(),
  hasEventBeenProcessed: jest.fn(),
  updateSubscriptionStatus: jest.fn(),
  findUserIdByCustomerId: jest.fn(),
}));
jest.mock("../src/app/api/_lib/idempotency", () => ({
  withIdempotency: jest.fn(),
}));

// helper to build a NextRequest with raw body + headers
function makeStripeReq(type: string, eventId = "evt_123", customer = "cus_abc", status = "active") {
  const event = {
    id: eventId,
    type,
    data: {
      object: {
        id: "sub_123",
        customer,
        status, // active, past_due, canceled, etc.
        metadata: {},
      },
    },
  };
  const body = JSON.stringify(event);
  return new NextRequest("http://localhost/api/webhook", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "stripe-signature": "t=_fake,sig=_fake" },
  }) as unknown as Request;
}

describe("webhook idempotency + mapping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (idem.withIdempotency as jest.Mock).mockImplementation(async (_id, fn) => fn());
    (db.findUserIdByCustomerId as jest.Mock).mockResolvedValue("user_123");
  });

  it("updates status on first event and records idempotency key", async () => {
    (db.hasEventBeenProcessed as jest.Mock).mockResolvedValue(false);

    const req = makeStripeReq("customer.subscription.updated", "evt_first", "cus_abc", "active");
    const res = await webhookHandler(req);

    expect(db.updateSubscriptionStatus).toHaveBeenCalledWith("user_123", "pro"); // active -> pro
    expect(db.markEventProcessed).toHaveBeenCalledWith("evt_first");
    expect(res.status).toBe(200);
  });

  it("ignores duplicate event", async () => {
    (db.hasEventBeenProcessed as jest.Mock).mockResolvedValue(true);

    const req = makeStripeReq("customer.subscription.updated", "evt_dup", "cus_abc", "active");
    const res = await webhookHandler(req);

    expect(db.updateSubscriptionStatus).not.toHaveBeenCalled();
    expect(db.markEventProcessed).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("maps statuses correctly", async () => {
    (db.hasEventBeenProcessed as jest.Mock).mockResolvedValue(false);

    // active -> pro
    await webhookHandler(makeStripeReq("customer.subscription.updated", "evt_a", "cus_abc", "active"));
    expect(db.updateSubscriptionStatus).toHaveBeenCalledWith("user_123", "pro");

    // past_due -> past_due
    await webhookHandler(makeStripeReq("customer.subscription.updated", "evt_b", "cus_abc", "past_due"));
    expect(db.updateSubscriptionStatus).toHaveBeenCalledWith("user_123", "past_due");

    // canceled -> canceled (and you can gate features accordingly)
    await webhookHandler(makeStripeReq("customer.subscription.updated", "evt_c", "cus_abc", "canceled"));
    expect(db.updateSubscriptionStatus).toHaveBeenCalledWith("user_123", "canceled");
  });
});

