import {
  fullSignalMessage,
  isCapacityFull,
  nonNegativeIntOrNull,
  normalizeDemandThrottle,
  throttleDailyCap,
  throttlePerRunLimit,
} from "@/lib/capacity/control";

describe("capacity control helpers", () => {
  test("normalizeDemandThrottle", () => {
    expect(normalizeDemandThrottle("LOW")).toBe("low");
    expect(normalizeDemandThrottle("high")).toBe("high");
    expect(normalizeDemandThrottle("anything")).toBe("normal");
    expect(normalizeDemandThrottle(null)).toBe("normal");
  });

  test("nonNegativeIntOrNull", () => {
    expect(nonNegativeIntOrNull(null)).toBeNull();
    expect(nonNegativeIntOrNull("")).toBeNull();
    expect(nonNegativeIntOrNull("12")).toBe(12);
    expect(nonNegativeIntOrNull(12.9)).toBe(12);
    expect(nonNegativeIntOrNull(-1)).toBeNull();
    expect(nonNegativeIntOrNull("nope")).toBeNull();
  });

  test("throttle caps", () => {
    expect(throttleDailyCap("low")).toBe(25);
    expect(throttleDailyCap("normal")).toBe(50);
    expect(throttleDailyCap("high")).toBe(100);

    expect(throttlePerRunLimit("low")).toBe(10);
    expect(throttlePerRunLimit("normal")).toBe(25);
    expect(throttlePerRunLimit("high")).toBe(50);
  });

  test("capacity full + message", () => {
    expect(isCapacityFull(0, null)).toBe(false);
    expect(isCapacityFull(0, 0)).toBe(false);
    expect(isCapacityFull(4, 5)).toBe(false);
    expect(isCapacityFull(5, 5)).toBe(true);
    expect(isCapacityFull(6, 5)).toBe(true);

    expect(fullSignalMessage(false)).toBeNull();
    expect(fullSignalMessage(true)).toBe("Demand exceeds availability.");
  });
});





