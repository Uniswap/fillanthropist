import { describe, it } from 'node:test'
import assert from 'node:assert'
import { deriveSettlementAmount, derivePriorityFee } from '../client/utils'

describe('Settlement Amount Calculations', () => {
  // Test case from test_DeriveAmounts_NoPriorityFee
  it('returns minimum amount when no priority fee above baseline', () => {
    const minimumAmount = BigInt('95000000000000000000');    // 95 ether
    const baselinePriorityFee = BigInt(100e9);              // 100 gwei
    const scalingFactor = BigInt(1e18);                     // 1 WAD, no scaling
    const priorityFee = baselinePriorityFee + 1n;           // baseline + 1 wei

    const settlement = deriveSettlementAmount(
      priorityFee,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    assert.equal(settlement, minimumAmount);
  });

  // Test case from test_DeriveAmounts_ExactOut
  it('scales claim amount for exact-out case', () => {
    const minimumAmount = BigInt('950000000000000000');      // 0.95 ether
    const baselinePriorityFee = BigInt(100e9);              // 100 gwei
    const scalingFactor = BigInt('500000000000000000');     // 0.5 WAD
    const priorityFee = baselinePriorityFee + 2n;           // baseline + 2 wei

    // This should throw since we haven't implemented exact-out yet
    assert.throws(() => {
      deriveSettlementAmount(
        priorityFee,
        minimumAmount,
        baselinePriorityFee,
        scalingFactor
      );
    }, /unimplemented/);
  });

  // Test case from test_DeriveAmounts_ExactIn
  it('scales settlement amount for exact-in case', () => {
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
    // scalingMultiplier = 1e18 + ((1.5e18 - 1e18) * 2) = 2e18
    const expected = (minimumAmount * BigInt(2e18) + BigInt(1e18) - 1n) / BigInt(1e18);
    assert.equal(settlement, expected);
  });

  // Test case from test_DeriveAmounts_ExtremePriorityFee
  it('handles extreme priority fees', () => {
    const minimumAmount = BigInt('950000000000000000');      // 0.95 ether
    const baselinePriorityFee = BigInt(100e9);              // 100 gwei
    const scalingFactor = BigInt('1500000000000000000');    // 1.5 WAD
    const priorityFee = baselinePriorityFee + 10n;          // baseline + 10 wei

    const settlement = deriveSettlementAmount(
      priorityFee,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    // Priority fee above baseline is 10 wei
    // scalingMultiplier = 1e18 + ((1.5e18 - 1e18) * 10) = 6e18
    const expected = (minimumAmount * BigInt(6e18) + BigInt(1e18) - 1n) / BigInt(1e18);
    assert.equal(settlement, expected);
  });

  // Test case from test_DeriveAmounts_RealisticExactIn
  it('handles realistic exact-in case', () => {
    const minimumAmount = BigInt('950000000000000000');      // 0.95 ether
    const baselinePriorityFee = BigInt(100e9);              // 100 gwei
    const scalingFactor = BigInt('1000000000100000000');    // 1.0000000001 WAD
    const priorityFee = baselinePriorityFee + BigInt(5e9);  // baseline + 5 gwei

    const settlement = deriveSettlementAmount(
      priorityFee,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    // Priority fee above baseline is 5 gwei
    // scalingMultiplier = 1e18 + ((1.0000000001e18 - 1e18) * 5e9) = 1.5e18
    const expected = (minimumAmount * BigInt('1500000000000000000') + BigInt(1e18) - 1n) / BigInt(1e18);
    assert.equal(settlement, expected);
  });

  // Test case from test_DeriveAmounts_RealisticExactOut
  it('handles realistic exact-out case', () => {
    const minimumAmount = BigInt('950000000000000000');      // 0.95 ether
    const baselinePriorityFee = BigInt(100e9);              // 100 gwei
    const scalingFactor = BigInt('999999999900000000');     // 0.9999999999 WAD
    const priorityFee = baselinePriorityFee + BigInt(5e9);  // baseline + 5 gwei

    // This should throw since we haven't implemented exact-out yet
    assert.throws(() => {
      deriveSettlementAmount(
        priorityFee,
        minimumAmount,
        baselinePriorityFee,
        scalingFactor
      );
    }, /unimplemented/);
  });

  // Inverse calculation tests for each case
  it('inverse calculation works for exact-in case', () => {
    const minimumAmount = BigInt('950000000000000000');      // 0.95 ether
    const baselinePriorityFee = BigInt(100e9);              // 100 gwei
    const scalingFactor = BigInt('1500000000000000000');    // 1.5 WAD
    // Desired settlement is 2x minimum amount
    const desiredSettlement = (minimumAmount * BigInt(2e18) + BigInt(1e18) - 1n) / BigInt(1e18);

    const requiredPriorityFee = derivePriorityFee(
      desiredSettlement,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    const actualSettlement = deriveSettlementAmount(
      requiredPriorityFee,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    assert.equal(actualSettlement, desiredSettlement);
  });

  it('inverse calculation works for extreme priority fee case', () => {
    const minimumAmount = BigInt('950000000000000000');      // 0.95 ether
    const baselinePriorityFee = BigInt(100e9);              // 100 gwei
    const scalingFactor = BigInt('1500000000000000000');    // 1.5 WAD
    // Desired settlement is 6x minimum amount
    const desiredSettlement = (minimumAmount * BigInt(6e18) + BigInt(1e18) - 1n) / BigInt(1e18);

    const requiredPriorityFee = derivePriorityFee(
      desiredSettlement,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    const actualSettlement = deriveSettlementAmount(
      requiredPriorityFee,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

    assert.equal(actualSettlement, desiredSettlement);
  });

  it('inverse calculation works for realistic exact-in case', () => {
    const minimumAmount = BigInt('950000000000000000');      // 0.95 ether
    const baselinePriorityFee = BigInt(100e9);              // 100 gwei
    const scalingFactor = BigInt('1000000000100000000');    // 1.0000000001 WAD
    // Desired settlement is 1.5x minimum amount
    const desiredSettlement = (minimumAmount * BigInt('1500000000000000000') + BigInt(1e18) - 1n) / BigInt(1e18);

    const requiredPriorityFee = derivePriorityFee(
      desiredSettlement,
      minimumAmount,
      baselinePriorityFee,
      scalingFactor
    );

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
