# Solana Agent Allowance Demo

This repository is a technical demo for Solana Native Subscriptions and Allowances. It shows how an application can give an AI agent a bounded USDC budget for paid API work without handing the agent custody of the user's wallet.

## Concept

The demo models a Canadian-market research assistant named `NorthStar API scout`:

1. A user initializes a Subscription Authority for a USDC token account.
2. The user grants an AI agent a recurring delegation: 5 USDC per day for seven days, with a 1.50 USDC maximum per pull.
3. The agent requests paid API work from a merchant service.
4. The merchant only builds a pull instruction when a usage event fits both the per-request limit and the remaining period allowance.
5. An optional one-hour fixed delegation acts as a narrow emergency budget for a single recovery task.

The important property is that the agent can perform useful paid work while the user keeps a predictable, revocable, on-chain spend envelope.

## Why subscriptions and allowances fit agent payments

AI agents increasingly need to pay for APIs, data, messaging, inference, execution environments, and specialist tools. A raw wallet key is too broad for that workflow. Native subscriptions and allowances give the user a more precise control surface:

- Recurring delegations encode a resettable budget such as "5 USDC per day".
- Fixed delegations encode a one-time approval for bounded jobs.
- Pull instructions let the merchant settle approved usage without asking the user to sign every small request.
- Revocation and expiry keep stale agents from retaining long-lived purchasing power.

## Repository layout

```text
src/allowance.ts      Pure TypeScript policy engine for usage approval.
src/instructions.ts   @solana/subscriptions instruction builders and PDA derivation.
src/index.ts          Runnable demo scenario that prints the policy, usage decisions, PDAs, and instruction summaries.
test/allowance.test.ts
```

## Run locally

```bash
npm install
npm run build
npm test
npm run demo
```

The demo is intentionally safe by default: it creates local throwaway signers, constructs instructions, and prints a JSON plan. It does not send a transaction, request an airdrop, use a private key, or require SOL.

## Example output

The demo output includes:

- the recurring allowance parameters;
- generated user, agent, merchant, Subscription Authority, and Recurring Delegation addresses;
- approved and rejected usage events;
- instruction summaries for:
  - `initSubscriptionAuthority`;
  - `createRecurringDelegation`;
  - `transferRecurring`;
  - `createFixedDelegation`.

## Extension ideas

- Add a UI where users approve an agent budget with clear reset and expiry terms.
- Persist usage events off-chain and periodically reconcile them with delegation pulls.
- Add Canadian builder directories or payment APIs as first-party merchants.
- Use a recurring delegation for normal usage and a fixed delegation for one-off incident response.
- Add a risk engine that automatically revokes the delegation when the agent asks for suspicious or out-of-policy work.

## References

- Solana announcement: https://solana.com/news/subscriptions-and-allowances
- TypeScript SDK: https://www.npmjs.com/package/@solana/subscriptions
- Source program: https://github.com/solana-program/subscriptions

