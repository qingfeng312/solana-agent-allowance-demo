# Solana Native Subscriptions and Allowances: A Practical Architecture for Agent Payments

Solana Native Subscriptions and Allowances give wallet owners a way to delegate constrained token spending without transferring custody of the wallet. That matters because useful software agents increasingly need small, repeated payments for APIs, data, inference, messaging, execution, and settlement. A wallet private key is too powerful for that job. A per-period allowance is closer to the actual permission the user wants to grant.

This article explains the architecture behind the primitive, the tradeoffs involved, and a concrete agent-payment design implemented in this repository.

## What the primitive provides

The current TypeScript SDK, `@solana/subscriptions@0.3.0`, describes the program as a Solana program for token delegations, recurring payments, and subscription plans. It ships as an `@solana/kit` plugin and exposes three core categories:

- Delegation management: initialize a Subscription Authority, create fixed delegations, create recurring delegations, and revoke delegations.
- Transfers: pull from fixed, recurring, or subscription delegations.
- Subscription plans: create, update, delete, subscribe, cancel, and resume plans.

The architecture has a clean separation of roles:

- The user owns the token account and signs the initial permission.
- The Subscription Authority PDA represents the user's per-mint delegation control surface.
- A fixed delegation grants a one-time allowance with optional expiry.
- A recurring delegation grants an amount per period, such as 5 USDC per day.
- A subscription delegation connects a subscriber to a published merchant plan.
- A delegatee or puller executes transfer instructions only within the rules encoded in the relevant delegation.

For an agent-payment application, the recurring delegation is the most useful building block. It supports an explicit budget ceiling and reset interval, which maps naturally to real service usage.

## Account model

The SDK exposes PDA helpers for the main program accounts:

- `findSubscriptionAuthorityPda({ user, tokenMint })`
- `findFixedDelegationPda({ subscriptionAuthority, delegator, delegatee, nonce })`
- `findRecurringDelegationPda({ subscriptionAuthority, delegator, delegatee, nonce })`
- `findPlanPda({ owner, planId })`
- `findSubscriptionDelegationPda({ planPda, subscriber })`

The Subscription Authority is scoped by user and token mint. That makes it the natural parent for all delegations over a specific token account. Fixed and recurring delegations are then scoped by the authority, delegator, delegatee, and nonce. This layout prevents a generic spender from becoming a permanent wallet operator; the spender only receives a program-recognized right to pull under a specific delegation.

The current demo builds the following structure:

```text
user wallet
  -> USDC associated token account
  -> Subscription Authority PDA
       -> Recurring Delegation PDA for the agent delegate
       -> optional one-hour Fixed Delegation PDA for incident recovery
merchant treasury
  -> receives approved usage pulls
```

The program address emitted by the SDK in the local demo is:

```text
De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44
```

## Instruction flow

The demo uses four instruction builders from `@solana/subscriptions`.

### 1. Initialize the Subscription Authority

```ts
await getInitSubscriptionAuthorityOverlayInstructionAsync({
  owner: user,
  payer: user,
  tokenMint: USDC_MINT,
  tokenProgram: TOKEN_PROGRAM,
  userAta
});
```

This sets up the per-user, per-mint authority. In a production wallet, this is the point where the user sees the token mint, token account, and app requesting allowance capability.

### 2. Create a recurring delegation

```ts
await getCreateRecurringDelegationOverlayInstructionAsync({
  tokenMint: USDC_MINT,
  delegator: user,
  payer: user,
  delegatee: agentDelegate,
  nonce: 1n,
  amountPerPeriod: usdc("5.00"),
  periodLengthS: 86_400n,
  startTs,
  expiryTs,
  expectedSubscriptionAuthorityInitId: 0n
});
```

This is the agent budget. In this demo, the agent can spend up to 5 USDC per day for seven days. The `expiryTs` is important because it prevents forgotten agents from retaining open-ended purchasing power.

### 3. Transfer from the recurring delegation

```ts
await getTransferRecurringOverlayInstructionAsync({
  delegatee: agentDelegate,
  delegator: user.address,
  delegationPda: recurringDelegation,
  delegatorAta: userAta,
  receiverAta: merchantAta,
  tokenMint: USDC_MINT,
  tokenProgram: TOKEN_PROGRAM,
  amount: approvedUsageAmount
});
```

This is the usage settlement step. The merchant or agent-side payment service should only build this instruction after local policy checks pass. The on-chain program enforces the delegation; the application layer still decides whether a usage event is legitimate.

### 4. Optional fixed delegation

```ts
await getCreateFixedDelegationOverlayInstructionAsync({
  tokenMint: USDC_MINT,
  delegator: user,
  payer: user,
  delegatee: agentDelegate,
  nonce: 99n,
  amount: usdc("1.50"),
  expiryTs: startTs + 3_600n,
  expectedSubscriptionAuthorityInitId: 0n
});
```

Fixed delegations are useful for one-off recovery tasks, manual top-ups, or single-purpose service purchases. They are less suitable for normal agent operation because they do not express a recurring budget.

## Off-chain policy layer

The on-chain delegation is necessary but not sufficient. A merchant still needs a deterministic off-chain policy engine that decides which usage events should become pull attempts.

This repository includes a small policy engine:

```ts
type AllowancePolicy = {
  label: string;
  amountPerPeriod: bigint;
  maxPerPull: bigint;
  periodLengthSeconds: bigint;
  startTimestamp: bigint;
  expiryTimestamp: bigint;
};
```

The policy checks:

- the event is inside the current delegation window;
- the amount does not exceed `maxPerPull`;
- cumulative approved spend in the period does not exceed `amountPerPeriod`;
- rejected events do not consume the remaining budget.

Example decision output:

```json
{
  "approvedSpend": "3.400000",
  "remainingAllowance": "1.600000",
  "events": [
    { "id": "req-001", "approved": true, "reason": "within recurring allowance" },
    { "id": "req-002", "approved": true, "reason": "within recurring allowance" },
    { "id": "req-003", "approved": false, "reason": "amount exceeds maxPerPull" },
    { "id": "req-004", "approved": true, "reason": "within recurring allowance" }
  ]
}
```

This split is intentional. The chain should enforce the hard token-spend envelope. The application should enforce business-specific rules such as whether the API call was useful, whether the merchant delivered the service, and whether the usage event matches the agent's task.

## A concrete agent use case

The demo models `NorthStar API scout`, an agent that researches Canadian Solana ecosystem opportunities. The agent needs paid API calls for market data, company metadata, and developer ecosystem signals. The user does not want to approve every 75-cent API call, but also does not want to give the agent unlimited wallet authority.

The user grants:

```text
5 USDC per day
1.50 USDC max per pull
7 day expiry
USDC mint only
single agent delegate
```

That is enough for useful autonomous work, but bounded enough that failure is contained. If the agent starts making oversized requests, the off-chain policy rejects them. If the off-chain policy fails, the recurring delegation still caps the damage.

## Canadian relevance

Subscriptions and allowances are especially relevant to Canadian software and commerce companies that need predictable authorization rather than speculative token flows.

### Shopify-style commerce automation

Merchants often need recurring small charges for apps, fulfillment, analytics, or support workflows. A Solana allowance can encode a merchant-approved app budget where the user or business grants a maximum daily or monthly spend instead of repeatedly approving invoices.

### Lightspeed-style retail operations

Retail systems depend on many background services: inventory sync, loyalty providers, fraud checks, accounting exports, and analytics. A recurring allowance lets each integration pull small, auditable amounts for delivered service without becoming a general custodian of store funds.

### Wealthsimple-style fintech tooling

Fintech products need clear consent boundaries. A fixed or recurring delegation can express precise authorization for a narrow financial workflow: pay for data, rebalance a model portfolio within a cap, or settle a subscription while preserving a strong revocation path.

These examples are not claims that those companies currently use this primitive. They show why Canadian commerce and fintech products would benefit from a permission model that is more expressive than a single wallet signature and safer than a transferable key.

## Benefits

### Users get bounded autonomy

Users can let agents act without granting open-ended custody. The allowance has a mint, amount, period, start time, expiry, and delegatee.

### Merchants get pull-based settlement

Merchants can settle approved usage without forcing the user through repeated signing prompts. That is better for metered APIs, SaaS seats, AI inference, data access, and subscriptions.

### Agents get a payment rail

Agents can purchase tools in small increments. This is more realistic than assuming every agent action is free or asking users to prepay large credits to every service.

### Auditors get a clear trail

Delegation PDAs, pull instructions, and usage events can be reconciled. A service can expose a table that maps every pull to a usage event and policy decision.

## Tradeoffs

### Allowance design is a security product decision

The primitive provides the rails, but product teams must choose defaults. A 5 USDC daily cap is different from a 5,000 USDC monthly cap. Wallets and apps need plain-language previews, revocation controls, and risk warnings.

### Off-chain usage accounting still matters

The chain can enforce the maximum pull amount and period. It cannot decide whether a data provider's response was useful or whether an API call matched the user's intent. That requires application logic, logs, and dispute handling.

### Pull permissions can still be abused inside the cap

A bad merchant or compromised delegatee can attempt to drain the allowed amount. The mitigation is not to pretend that cannot happen; it is to keep caps small, expiries short, revocation visible, and event logs easy to inspect.

### UX must avoid blind approvals

The user should see the mint, delegatee, amount per period, max pull, expiry, and revocation route before signing. Wallet UI has to make "5 USDC/day for 7 days" obvious.

### Tooling is young

The SDK is usable today, but applications should pin versions, test instruction construction, and monitor program/API updates. This repository pins `@solana/subscriptions` to `0.3.0` and verifies instruction construction in tests.

## Implementation notes from the demo

The repo intentionally avoids sending real transactions. It generates throwaway signers, builds instructions, and prints summaries:

```text
initSubscriptionAuthority: 7 accounts, 1 data byte
createRecurringDelegation: 6 accounts, 49 data bytes
transferRecurring: 9 accounts, 73 data bytes
emergencyFixedDelegation: 6 accounts, 33 data bytes
```

That makes the code sample safe to run without SOL or private keys while still demonstrating the real SDK surfaces and account relationships.

Run it with:

```bash
npm install
npm run build
npm test
npm run demo
```

## New business opportunities

### Agent tool marketplaces

Agents could buy data, hosted execution, retrievers, search APIs, or specialist skills from marketplaces. Allowances let the user grant a budget once and audit settlement later.

### Metered AI and data APIs

Providers can charge per call without forcing a credit-card subscription or prepaid balance. The user grants a recurring allowance, and the provider pulls only for approved usage.

### Business automation budgets

A company could grant department-level allowances to procurement, reporting, or operations agents. Each agent gets a constrained budget and expiry instead of a broad wallet.

### Safer DeFi automation

DeFi agents can be limited to narrow payment or subscription actions. Riskier token approvals and trading flows should still require stronger review, but recurring service payments can become much less manual.

## Conclusion

Solana Native Subscriptions and Allowances are useful because they encode the missing middle between "sign every transaction manually" and "hand the agent the wallet." For agent payments, that middle is the product: bounded autonomy, predictable settlement, and revocable token permissions.

The demo in this repository shows one practical implementation path: an AI agent receives a recurring USDC allowance, a policy engine approves small usage events, and the merchant pulls only within the encoded spend envelope.

## References

- Solana announcement: https://solana.com/news/subscriptions-and-allowances
- `@solana/subscriptions` package: https://www.npmjs.com/package/@solana/subscriptions
- Program source: https://github.com/solana-program/subscriptions
- Demo repository: https://github.com/qingfeng312/solana-agent-allowance-demo

