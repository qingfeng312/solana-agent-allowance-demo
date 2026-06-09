export type MicroUsdc = bigint;

export type AllowancePolicy = {
  label: string;
  amountPerPeriod: MicroUsdc;
  maxPerPull: MicroUsdc;
  periodLengthSeconds: bigint;
  startTimestamp: bigint;
  expiryTimestamp: bigint;
};

export type UsageEvent = {
  id: string;
  timestamp: bigint;
  amount: MicroUsdc;
  purpose: string;
};

export type EvaluatedUsageEvent = UsageEvent & {
  approved: boolean;
  reason: string;
  runningSpend: MicroUsdc;
};

export type UsageSummary = {
  periodStart: bigint;
  periodEnd: bigint;
  approvedSpend: MicroUsdc;
  remainingAllowance: MicroUsdc;
  events: EvaluatedUsageEvent[];
};

export function usdc(amount: string): MicroUsdc {
  const [whole, fractional = ""] = amount.split(".");
  if (!/^\d+$/.test(whole) || !/^\d{0,6}$/.test(fractional)) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }

  return BigInt(whole) * 1_000_000n + BigInt(fractional.padEnd(6, "0"));
}

export function formatUsdc(amount: MicroUsdc): string {
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / 1_000_000n;
  const fractional = (absolute % 1_000_000n).toString().padStart(6, "0");
  return `${sign}${whole}.${fractional}`;
}

export function periodBounds(policy: AllowancePolicy, timestamp: bigint) {
  if (timestamp < policy.startTimestamp || timestamp >= policy.expiryTimestamp) {
    throw new Error("Timestamp is outside the delegation validity window");
  }

  const elapsed = timestamp - policy.startTimestamp;
  const index = elapsed / policy.periodLengthSeconds;
  const periodStart = policy.startTimestamp + index * policy.periodLengthSeconds;
  const periodEnd = periodStart + policy.periodLengthSeconds;

  return {
    periodStart,
    periodEnd: periodEnd > policy.expiryTimestamp ? policy.expiryTimestamp : periodEnd
  };
}

export function evaluateUsage(policy: AllowancePolicy, events: UsageEvent[], now: bigint): UsageSummary {
  const { periodStart, periodEnd } = periodBounds(policy, now);
  let approvedSpend = 0n;

  const eventsInPeriod = events
    .filter((event) => event.timestamp >= periodStart && event.timestamp < periodEnd)
    .sort((a, b) => Number(a.timestamp - b.timestamp));

  const evaluated = eventsInPeriod.map((event) => {
    if (event.amount > policy.maxPerPull) {
      return {
        ...event,
        approved: false,
        reason: "amount exceeds maxPerPull",
        runningSpend: approvedSpend
      };
    }

    const nextSpend = approvedSpend + event.amount;
    if (nextSpend > policy.amountPerPeriod) {
      return {
        ...event,
        approved: false,
        reason: "amount exceeds remaining period allowance",
        runningSpend: approvedSpend
      };
    }

    approvedSpend = nextSpend;
    return {
      ...event,
      approved: true,
      reason: "within recurring allowance",
      runningSpend: approvedSpend
    };
  });

  return {
    periodStart,
    periodEnd,
    approvedSpend,
    remainingAllowance: policy.amountPerPeriod - approvedSpend,
    events: evaluated
  };
}

