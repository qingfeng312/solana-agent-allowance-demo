import {
  address,
  generateKeyPairSigner,
  type Address,
  type Instruction,
  type TransactionSigner
} from "@solana/kit";
import {
  findRecurringDelegationPda,
  findSubscriptionAuthorityPda,
  getCreateFixedDelegationOverlayInstructionAsync,
  getCreateRecurringDelegationOverlayInstructionAsync,
  getInitSubscriptionAuthorityOverlayInstructionAsync,
  getTransferRecurringOverlayInstructionAsync
} from "@solana/subscriptions";
import type { AllowancePolicy, MicroUsdc } from "./allowance.js";

export const USDC_MINT = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export type DemoAccounts = {
  user: TransactionSigner;
  agentDelegate: TransactionSigner;
  merchantTreasury: TransactionSigner;
  userAta: Address;
  merchantAta: Address;
};

export type DelegationPlan = {
  subscriptionAuthority: Address;
  recurringDelegation: Address;
  setupInstructions: Instruction[];
  pullInstruction: Instruction;
  emergencyFixedDelegationInstruction: Instruction;
};

export async function createDemoAccounts(): Promise<DemoAccounts> {
  const user = await generateKeyPairSigner();
  const agentDelegate = await generateKeyPairSigner();
  const merchantTreasury = await generateKeyPairSigner();
  const userAta = (await generateKeyPairSigner()).address;
  const merchantAta = (await generateKeyPairSigner()).address;

  return { user, agentDelegate, merchantTreasury, userAta, merchantAta };
}

export async function buildAgentAllowancePlan(
  accounts: DemoAccounts,
  policy: AllowancePolicy,
  firstPullAmount: MicroUsdc
): Promise<DelegationPlan> {
  const [subscriptionAuthority] = await findSubscriptionAuthorityPda({
    user: accounts.user.address,
    tokenMint: USDC_MINT
  });
  const [recurringDelegation] = await findRecurringDelegationPda({
    subscriptionAuthority,
    delegator: accounts.user.address,
    delegatee: accounts.agentDelegate.address,
    nonce: 1n
  });

  const initAuthority = await getInitSubscriptionAuthorityOverlayInstructionAsync({
    owner: accounts.user,
    payer: accounts.user,
    tokenMint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM,
    userAta: accounts.userAta
  });

  const recurringDelegationInstruction = await getCreateRecurringDelegationOverlayInstructionAsync({
    tokenMint: USDC_MINT,
    delegator: accounts.user,
    payer: accounts.user,
    delegatee: accounts.agentDelegate.address,
    nonce: 1n,
    amountPerPeriod: policy.amountPerPeriod,
    periodLengthS: policy.periodLengthSeconds,
    startTs: policy.startTimestamp,
    expiryTs: policy.expiryTimestamp,
    expectedSubscriptionAuthorityInitId: 0n
  });

  const pullInstruction = await getTransferRecurringOverlayInstructionAsync({
    delegatee: accounts.agentDelegate,
    delegator: accounts.user.address,
    delegationPda: recurringDelegation,
    delegatorAta: accounts.userAta,
    receiverAta: accounts.merchantAta,
    tokenMint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM,
    amount: firstPullAmount
  });

  const emergencyFixedDelegationInstruction = await getCreateFixedDelegationOverlayInstructionAsync({
    tokenMint: USDC_MINT,
    delegator: accounts.user,
    payer: accounts.user,
    delegatee: accounts.agentDelegate.address,
    nonce: 99n,
    amount: policy.maxPerPull,
    expiryTs: policy.startTimestamp + 3_600n,
    expectedSubscriptionAuthorityInitId: 0n
  });

  return {
    subscriptionAuthority,
    recurringDelegation,
    setupInstructions: [initAuthority, recurringDelegationInstruction],
    pullInstruction,
    emergencyFixedDelegationInstruction
  };
}

export function summarizeInstruction(instruction: Instruction) {
  return {
    programAddress: instruction.programAddress,
    accountCount: instruction.accounts?.length ?? 0,
    dataBytes: instruction.data?.length ?? 0
  };
}

