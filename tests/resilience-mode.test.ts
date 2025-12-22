import {
  followupDelayMultiplierForResilienceMode,
  normalizeResilienceMode,
  throttleForResilienceMode,
} from "@/lib/resilience/mode";

describe("resilience mode helpers", () => {
  test("normalizeResilienceMode", () => {
    expect(normalizeResilienceMode(undefined)).toBe("normal");
    expect(normalizeResilienceMode(null)).toBe("normal");
    expect(normalizeResilienceMode("NORMAL")).toBe("normal");
    expect(normalizeResilienceMode("storm")).toBe("storm");
    expect(normalizeResilienceMode("SURGE")).toBe("surge");
    expect(normalizeResilienceMode("anything")).toBe("normal");
  });

  test("throttleForResilienceMode", () => {
    expect(throttleForResilienceMode("normal")).toBe("normal");
    expect(throttleForResilienceMode("storm")).toBe("low");
    expect(throttleForResilienceMode("surge")).toBe("high");
  });

  test("followupDelayMultiplierForResilienceMode", () => {
    expect(followupDelayMultiplierForResilienceMode("normal")).toBe(1);
    expect(followupDelayMultiplierForResilienceMode("surge")).toBe(1.5);
    expect(followupDelayMultiplierForResilienceMode("storm")).toBe(2);
  });
});



