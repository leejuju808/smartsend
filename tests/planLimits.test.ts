/**
 * tests/planLimits.test.ts
 * Verifies daily caps: free=50/day, pro=500/day
 */
import { NextRequest } from "next/server";
import { planLimitsMiddleware, __testables } from "../src/app/api/_lib/planLimits";

jest.mock("../src/app/api/_lib/db", () => ({
  getUserProfile: jest.fn(),
  getDailySendCount: jest.fn(),
  incrementSendCount: jest.fn(),
}));

import * as db from "../src/app/api/_lib/db";

const makeReq = (overrides: Partial<RequestInit> = {}) =>
  new NextRequest("http://localhost/api/send", {
    method: "POST",
    ...overrides,
  });

const makeCtx = (userId = "user_123") => ({
  userId,
});

describe("planLimitsMiddleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows FREE user at 49/50", async () => {
    (db.getUserProfile as jest.Mock).mockResolvedValue({ id: "user_123", subscription_status: "free" });
    (db.getDailySendCount as jest.Mock).mockResolvedValue(49);

    const res = await planLimitsMiddleware(makeReq(), makeCtx("user_123"));
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(1);
  });

  it("blocks FREE user at 50/50", async () => {
    (db.getUserProfile as jest.Mock).mockResolvedValue({ id: "user_123", subscription_status: "free" });
    (db.getDailySendCount as jest.Mock).mockResolvedValue(50);

    const res = await planLimitsMiddleware(makeReq(), makeCtx("user_123"));
    expect(res.allowed).toBe(false);
    expect(res.status).toBe(402);
    expect(res.code).toBe("LIMIT_EXCEEDED");
    expect(res.plan).toBe("free");
  });

  it("allows PRO user at 499/500", async () => {
    (db.getUserProfile as jest.Mock).mockResolvedValue({ id: "user_999", subscription_status: "pro" });
    (db.getDailySendCount as jest.Mock).mockResolvedValue(499);

    const res = await planLimitsMiddleware(makeReq(), makeCtx("user_999"));
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(1);
  });

  it("blocks PRO user at 500/500", async () => {
    (db.getUserProfile as jest.Mock).mockResolvedValue({ id: "user_999", subscription_status: "pro" });
    (db.getDailySendCount as jest.Mock).mockResolvedValue(500);

    const res = await planLimitsMiddleware(makeReq(), makeCtx("user_999"));
    expect(res.allowed).toBe(false);
    expect(res.status).toBe(402);
    expect(res.code).toBe("LIMIT_EXCEEDED");
    expect(res.plan).toBe("pro");
  });

  it("treats unknown plan as FREE (defensive)", async () => {
    (db.getUserProfile as jest.Mock).mockResolvedValue({ id: "user_x", subscription_status: "weird" });
    (db.getDailySendCount as jest.Mock).mockResolvedValue(50);

    const res = await planLimitsMiddleware(makeReq(), makeCtx("user_x"));
    expect(res.allowed).toBe(false);
    expect(res.plan).toBe("free");
  });
});

