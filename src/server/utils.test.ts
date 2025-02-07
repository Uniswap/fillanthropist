import { describe, it } from 'node:test'
import assert from 'node:assert'
import { deriveSettlementAmount, derivePriorityFee } from './utils'

describe('Settlement Amount Calculations', () => {
  it('returns minimum amount when priority fee is below baseline', () => {
    const priorityFee = BigInt(1e9);          // 1 gwei
    const minimumAmount = BigInt(1e18);       // 1 token
    const baselinePriorityFee = BigInt(2e9);  // 2 gwei
    const scalingFactor = BigInt(2e18);       // 2x scaling

    const settlement = deriveSettlementAmount(
      priorityFee,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    assert.equal(settlement, minimumAmount);
  });

  it('scales settlement amount with priority fee above baseline (matches Solidity test_DeriveAmounts_ExactIn)', () => {
    const minimumAmount = BigInt('950000000000000000');      // 0.95 ether
    const baselinePriorityFee = BigInt(100e9);              // 100 gwei
    const scalingFactor = BigInt('1500000000000000000');    // 1.5 WAD
    const priorityFee = baselinePriorityFee + 2n;           // baseline + 2 wei

    const settlement = deriveSettlementAmount(
      priorityFee,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    // Priority fee above baseline is 2 wei
    // For exact-in with 1.5 WAD scaling factor:
    // scalingMultiplier = 1e18 + ((1.5e18 - 1e18) * 2)
    // = 1e18 + (0.5e18 * 2)
    // = 2e18
    // Expected: minimumAmount * 2
    const expected = (minimumAmount * BigInt(2e18) + BigInt(1e18) - 1n) / BigInt(1e18);
    assert.equal(settlement, expected);
  });

  it('inverse calculation produces correct priority fee (matches Solidity scaling)', () => {
    const minimumAmount = BigInt('950000000000000000');      // 0.95 ether
    const baselinePriorityFee = BigInt(100e9);              // 100 gwei
    const scalingFactor = BigInt('1500000000000000000');    // 1.5 WAD
    // Desired settlement is 2x minimum amount
    const desiredSettlement = (minimumAmount * BigInt(2e18) + BigInt(1e18) - 1n) / BigInt(1e18);

    // Calculate required priority fee
    const requiredPriorityFee = derivePriorityFee(
      desiredSettlement,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    // Verify it produces the desired settlement amount
    const actualSettlement = deriveSettlementAmount(
      requiredPriorityFee,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    assert.equal(actualSettlement, desiredSettlement);
  });

  it('handles 1e18 scaling factor by returning minimum amount', () => {
    const priorityFee = BigInt(3e9);          // 3 gwei
    const minimumAmount = BigInt(1e18);       // 1 token
    const baselinePriorityFee = BigInt(2e9);  // 2 gwei
    const scalingFactor = BigInt(1e18);       // 1x scaling (no scaling)

    const settlement = deriveSettlementAmount(
      priorityFee,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    assert.equal(settlement, minimumAmount);
  });

  it('inverse calculation returns baseline fee when desired amount equals minimum', () => {
    const desiredSettlement = BigInt(1e18);   // 1 token
    const minimumAmount = BigInt(1e18);       // 1 token
    const baselinePriorityFee = BigInt(2e9);  // 2 gwei
    const scalingFactor = BigInt(2e18);       // 2x scaling

    const requiredPriorityFee = derivePriorityFee(
      desiredSettlement,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    assert.equal(requiredPriorityFee, baselinePriorityFee);
  });
});
