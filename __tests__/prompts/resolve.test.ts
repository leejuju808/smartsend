/**
 * Unit tests for prompt pack resolution and version stamping
 * 
 * Tests:
 * 1) Returns step override > campaign override > latest active
 * 2) Stamps versions on scheduled_messages
 * 3) Rollback API swaps versions and reflects in next compose
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Note: These are integration-style tests that would require a test database
// For now, we'll document the expected behavior

describe("resolvePromptPack", () => {
  it("should return step-specific override when available", () => {
    // Test: When step_number=2 override exists, it should take precedence over campaign-wide override
    // Expected: Returns pack_id and version from step-specific override
  });

  it("should return campaign-wide override when step override not available", () => {
    // Test: When no step override but campaign override exists
    // Expected: Returns pack_id and version from campaign-wide override
  });

  it("should return latest active pack when no overrides", () => {
    // Test: When no overrides exist, calls RPC get_latest_active_pack_for_campaign
    // Expected: Returns latest active pack for account/kind
  });
});

describe("stampPromptVersions", () => {
  it("should stamp all three pack types on scheduled_messages", () => {
    // Test: When enqueueing a message, should call resolvePromptPack for rewrite, policy, guardrails
    // Expected: scheduled_messages row updated with rewrite_pack_id, rewrite_prompt_version, etc.
  });
});

describe("rollbackPromptVersion", () => {
  it("should rollback to previous version when preflight fails", () => {
    // Test: When preflight fails after version bump, finds previous successful version
    // Expected: campaign_prompt_overrides updated to previous version, logged in system_logs
  });
});
