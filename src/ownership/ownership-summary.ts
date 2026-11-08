import { ClaimMethod, ClaimStatus } from '../../generated/prisma';
import { OwnershipDto, OwnershipStatus } from './dto/ownership.dto';

/** Receipt uploads allowed per user per product, counting every attempt. */
export const MAX_RECEIPT_ATTEMPTS = 5;

export interface ClaimFacts {
  method: ClaimMethod;
  status: ClaimStatus;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

/**
 * Derives what a shopper sees about owning one product from their claims for
 * it. Order of precedence: verified, then under review, then out of
 * attempts, then last rejected, then not yet claimed.
 */
export function summarizeOwnership(
  claims: ClaimFacts[],
  cardVerifiedAt: Date | null = null,
): OwnershipDto {
  const sorted = [...claims].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const receiptAttemptsUsed = sorted.filter(
    (claim) => claim.method === ClaimMethod.RECEIPT,
  ).length;
  const base = {
    receiptAttemptsUsed,
    receiptAttemptsLeft: Math.max(
      0,
      MAX_RECEIPT_ATTEMPTS - receiptAttemptsUsed,
    ),
  };

  const approved = sorted.find(
    (claim) => claim.status === ClaimStatus.APPROVED,
  );
  if (approved || cardVerifiedAt) {
    return {
      ...base,
      status: OwnershipStatus.VERIFIED,
      method: approved?.method,
      verifiedAt: cardVerifiedAt ?? approved?.reviewedAt ?? approved?.createdAt,
    };
  }

  const pending = sorted.find((claim) => claim.status === ClaimStatus.PENDING);
  if (pending) {
    return {
      ...base,
      status: OwnershipStatus.PENDING,
      pendingSince: pending.createdAt,
    };
  }

  const last = sorted.at(-1);
  if (receiptAttemptsUsed >= MAX_RECEIPT_ATTEMPTS) {
    return {
      ...base,
      status: OwnershipStatus.BLOCKED,
      lastRejectionReason: last?.rejectionReason ?? undefined,
    };
  }
  if (last?.status === ClaimStatus.REJECTED) {
    return {
      ...base,
      status: OwnershipStatus.REJECTED,
      lastRejectionReason: last.rejectionReason ?? undefined,
    };
  }
  return { ...base, status: OwnershipStatus.UNVERIFIED };
}
