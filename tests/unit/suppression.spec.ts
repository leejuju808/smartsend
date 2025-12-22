import { isSuppressed, addSuppression } from "../../src/lib/email/suppression";

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null })
        }))
      })),
      upsert: jest.fn().mockResolvedValue({ data: null, error: null })
    }))
  }))
}));

describe("Email Suppression Utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns false for unknown email", async () => {
    const result = await isSuppressed("unknown@example.com");
    expect(result).toBe(false);
  });

  it("adds suppression successfully", async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ data: null, error: null });
    const mockFrom = jest.fn(() => ({ upsert: mockUpsert }));
    const mockCreateClient = require('@supabase/supabase-js').createClient;
    mockCreateClient.mockReturnValue({ from: mockFrom });

    await addSuppression("test@example.com", "api", "user_unsubscribed");

    expect(mockFrom).toHaveBeenCalledWith("suppression_list");
    expect(mockUpsert).toHaveBeenCalledWith({
      email: "test@example.com",
      source: "api",
      reason: "user_unsubscribed"
    });
  });

  it("handles suppression check with mocked data", async () => {
    const mockMaybeSingle = jest.fn().mockResolvedValue({ 
      data: { email: "suppressed@example.com" }, 
      error: null 
    });
    const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
    const mockSelect = jest.fn(() => ({ eq: mockEq }));
    const mockFrom = jest.fn(() => ({ select: mockSelect }));
    const mockCreateClient = require('@supabase/supabase-js').createClient;
    mockCreateClient.mockReturnValue({ from: mockFrom });

    const result = await isSuppressed("suppressed@example.com");
    expect(result).toBe(true);
  });
}); 