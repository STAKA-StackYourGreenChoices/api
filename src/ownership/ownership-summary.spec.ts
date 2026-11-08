import { ClaimMethod, ClaimStatus } from '../../generated/prisma';
import { OwnershipStatus } from './dto/ownership.dto';
import { ClaimFacts, summarizeOwnership } from './ownership-summary';

let clock = 0;
const claim = (
  status: ClaimStatus,
  method: ClaimMethod = ClaimMethod.RECEIPT,
  rejectionReason: string | null = null,
): ClaimFacts => ({
  status,
  method,
  rejectionReason,
  reviewedAt: status === ClaimStatus.PENDING ? null : new Date(++clock * 1000),
  createdAt: new Date(++clock * 1000),
});
const rejected = (reason = 'Blurry') =>
  claim(ClaimStatus.REJECTED, ClaimMethod.RECEIPT, reason);

describe('summarizeOwnership', () => {
  it('is unverified with 5 attempts when nothing was claimed', () => {
    expect(summarizeOwnership([])).toEqual({
      status: OwnershipStatus.UNVERIFIED,
      receiptAttemptsUsed: 0,
      receiptAttemptsLeft: 5,
    });
  });

  it('is verified once any claim is approved, even after rejections', () => {
    const result = summarizeOwnership([
      rejected(),
      claim(ClaimStatus.APPROVED, ClaimMethod.ORDER_MATCH),
    ]);
    expect(result).toMatchObject({
      status: OwnershipStatus.VERIFIED,
      method: ClaimMethod.ORDER_MATCH,
    });
  });

  it('is pending while a receipt waits for review', () => {
    expect(
      summarizeOwnership([rejected(), claim(ClaimStatus.PENDING)]),
    ).toMatchObject({
      status: OwnershipStatus.PENDING,
      receiptAttemptsUsed: 2,
      receiptAttemptsLeft: 3,
    });
  });

  it('shows the latest rejection reason while attempts remain', () => {
    expect(
      summarizeOwnership([rejected('Old'), rejected('Wrong product')]),
    ).toMatchObject({
      status: OwnershipStatus.REJECTED,
      lastRejectionReason: 'Wrong product',
      receiptAttemptsLeft: 3,
    });
  });

  it('blocks after 5 receipts in total', () => {
    const five = Array.from({ length: 5 }, () => rejected());
    expect(summarizeOwnership(five)).toMatchObject({
      status: OwnershipStatus.BLOCKED,
      receiptAttemptsUsed: 5,
      receiptAttemptsLeft: 0,
    });
    expect(summarizeOwnership(five.slice(0, 4)).status).toBe(
      OwnershipStatus.REJECTED,
    );
  });

  it('a 5th receipt still under review is pending, not blocked', () => {
    const claims = [
      ...Array.from({ length: 4 }, () => rejected()),
      claim(ClaimStatus.PENDING),
    ];
    expect(summarizeOwnership(claims)).toMatchObject({
      status: OwnershipStatus.PENDING,
      receiptAttemptsLeft: 0,
    });
  });

  it('a 5th receipt approved is verified', () => {
    const claims = [
      ...Array.from({ length: 4 }, () => rejected()),
      claim(ClaimStatus.APPROVED),
    ];
    expect(summarizeOwnership(claims).status).toBe(OwnershipStatus.VERIFIED);
  });

  it('failed order matches do not use up receipt attempts', () => {
    const result = summarizeOwnership([
      claim(ClaimStatus.REJECTED, ClaimMethod.ORDER_MATCH),
    ]);
    expect(result.receiptAttemptsLeft).toBe(5);
  });
});
