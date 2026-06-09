import { describe, expect, it } from "vitest";
import { evaluateUsage, formatUsdc, periodBounds, usdc, type AllowancePolicy } from "../src/allowance.js";
import { buildAgentAllowancePlan, createDemoAccounts } from "../src/instructions.js";

const day = 86_400n;
const basePolicy: AllowancePolicy = {
  label: "test allowance",
  amountPerPeriod: usdc("5.00"),
  maxPerPull: usdc("2.00"),
  periodLengthSeconds: day,
  startTimestamp: 1_783_036_800n,
  expiryTimestamp: 1_783_036_800n + day * 3n
};

describe("allowance policy", () => {
  it("formats micro-USDC without losing precision", () => {
    expect(formatUsdc(usdc("12.345678"))).toBe("12.345678");
  });

  it("rejects a pull over maxPerPull before touching the period budget", () => {
    const summary = evaluateUsage(
      basePolicy,
      [
        { id: "a", timestamp: basePolicy.startTimestamp + 1n, amount: usdc("2.01"), purpose: "too large" },
        { id: "b", timestamp: basePolicy.startTimestamp + 2n, amount: usdc("1.00"), purpose: "valid" }
      ],
      basePolicy.startTimestamp + 10n
    );

    expect(summary.events[0].approved).toBe(false);
    expect(summary.events[0].reason).toBe("amount exceeds maxPerPull");
    expect(summary.events[1].approved).toBe(true);
    expect(formatUsdc(summary.approvedSpend)).toBe("1.000000");
  });

  it("rejects events that would exceed the recurring period budget", () => {
    const summary = evaluateUsage(
      basePolicy,
      [
        { id: "a", timestamp: basePolicy.startTimestamp + 1n, amount: usdc("2.00"), purpose: "valid" },
        { id: "b", timestamp: basePolicy.startTimestamp + 2n, amount: usdc("2.00"), purpose: "valid" },
        { id: "c", timestamp: basePolicy.startTimestamp + 3n, amount: usdc("2.00"), purpose: "over budget" }
      ],
      basePolicy.startTimestamp + 10n
    );

    expect(summary.events.map((event) => event.approved)).toEqual([true, true, false]);
    expect(summary.events[2].reason).toBe("amount exceeds remaining period allowance");
    expect(formatUsdc(summary.remainingAllowance)).toBe("1.000000");
  });

  it("computes period boundaries from the policy window", () => {
    expect(periodBounds(basePolicy, basePolicy.startTimestamp + day + 12n)).toEqual({
      periodStart: basePolicy.startTimestamp + day,
      periodEnd: basePolicy.startTimestamp + day * 2n
    });
  });
});

describe("subscriptions instruction builders", () => {
  it("builds setup and pull instructions without network access", async () => {
    const accounts = await createDemoAccounts();
    const plan = await buildAgentAllowancePlan(accounts, basePolicy, usdc("1.00"));

    expect(plan.setupInstructions).toHaveLength(2);
    expect(plan.subscriptionAuthority).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(plan.recurringDelegation).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(plan.pullInstruction.accounts?.length).toBeGreaterThan(0);
    expect(plan.emergencyFixedDelegationInstruction.data?.length).toBeGreaterThan(0);
  });
});

