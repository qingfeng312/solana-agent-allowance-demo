import { evaluateUsage, formatUsdc, type UsageEvent, usdc } from "./allowance.js";
import { buildAgentAllowancePlan, createDemoAccounts, summarizeInstruction } from "./instructions.js";

const day = 86_400n;
const startTimestamp = 1_783_036_800n;

const policy = {
  label: "NorthStar API scout daily allowance",
  amountPerPeriod: usdc("5.00"),
  maxPerPull: usdc("1.50"),
  periodLengthSeconds: day,
  startTimestamp,
  expiryTimestamp: startTimestamp + 7n * day
};

const events: UsageEvent[] = [
  {
    id: "req-001",
    timestamp: startTimestamp + 600n,
    amount: usdc("0.75"),
    purpose: "agent fetched Canadian Solana ecosystem project signals"
  },
  {
    id: "req-002",
    timestamp: startTimestamp + 1_800n,
    amount: usdc("1.25"),
    purpose: "agent ranked subscription-ready SaaS use cases"
  },
  {
    id: "req-003",
    timestamp: startTimestamp + 3_600n,
    amount: usdc("3.75"),
    purpose: "oversized batch export blocked by policy"
  },
  {
    id: "req-004",
    timestamp: startTimestamp + 5_400n,
    amount: usdc("1.40"),
    purpose: "agent generated final buyer shortlist"
  }
];

const summary = evaluateUsage(policy, events, startTimestamp + 6_000n);
const approvedFirstPull = summary.events.find((event) => event.approved)?.amount ?? 0n;
const accounts = await createDemoAccounts();
const plan = await buildAgentAllowancePlan(accounts, policy, approvedFirstPull);

console.log(
  JSON.stringify(
    {
      concept: "A user grants an AI agent a recurring USDC allowance for paid API work; the merchant can only pull approved usage inside the per-period cap.",
      policy: {
        label: policy.label,
        amountPerPeriod: formatUsdc(policy.amountPerPeriod),
        maxPerPull: formatUsdc(policy.maxPerPull),
        periodLengthSeconds: policy.periodLengthSeconds.toString(),
        startTimestamp: policy.startTimestamp.toString(),
        expiryTimestamp: policy.expiryTimestamp.toString()
      },
      accounts: {
        user: accounts.user.address,
        agentDelegate: accounts.agentDelegate.address,
        merchantTreasury: accounts.merchantTreasury.address,
        subscriptionAuthority: plan.subscriptionAuthority,
        recurringDelegation: plan.recurringDelegation
      },
      usageDecision: {
        periodStart: summary.periodStart.toString(),
        periodEnd: summary.periodEnd.toString(),
        approvedSpend: formatUsdc(summary.approvedSpend),
        remainingAllowance: formatUsdc(summary.remainingAllowance),
        events: summary.events.map((event) => ({
          id: event.id,
          amount: formatUsdc(event.amount),
          approved: event.approved,
          reason: event.reason,
          runningSpend: formatUsdc(event.runningSpend)
        }))
      },
      instructions: {
        initSubscriptionAuthority: summarizeInstruction(plan.setupInstructions[0]),
        createRecurringDelegation: summarizeInstruction(plan.setupInstructions[1]),
        transferRecurring: summarizeInstruction(plan.pullInstruction),
        emergencyFixedDelegation: summarizeInstruction(plan.emergencyFixedDelegationInstruction)
      }
    },
    null,
    2
  )
);

