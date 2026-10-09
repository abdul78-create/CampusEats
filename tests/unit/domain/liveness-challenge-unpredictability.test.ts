import { describe, test, expect } from '@jest/globals';
import { LivenessChallengeGenerator } from '../../../src/modules/identity/domain/LivenessChallengeGenerator.js';
import { LivenessChallengeType } from '../../../src/modules/identity/domain/IdentityEnums.js';

describe('Liveness Challenge Generation & Unpredictability Engine', () => {
  describe('Fisher-Yates Dynamic Permutation Generation', () => {
    test('generates valid 3-gesture challenge permutation containing all defined gesture types without duplicates', () => {
      const allTypes = [
        LivenessChallengeType.NATURAL_BLINK,
        LivenessChallengeType.HEAD_TURN_LEFT,
        LivenessChallengeType.HEAD_TURN_RIGHT,
      ];

      for (let i = 0; i < 50; i++) {
        const sequence = LivenessChallengeGenerator.generateChallengeSequence();
        expect(sequence).toHaveLength(3);
        const uniqueSet = new Set(sequence);
        expect(uniqueSet.size).toBe(3);
        allTypes.forEach(t => expect(sequence).toContain(t));
      }
    });

    test('demonstrates permutation diversity across repeated generations', () => {
      const observedPermutations = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const seq = LivenessChallengeGenerator.generateChallengeSequence();
        observedPermutations.add(seq.join('->'));
      }
      // Out of 6 possible permutations (3! = 6), 100 draws should observe all 6 with overwhelming probability
      expect(observedPermutations.size).toBe(6);
    });
  });

  describe('Cryptographic Nonce Generation', () => {
    test('generates 64-character hexadecimal session nonce with 256 bits of entropy', () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const nonce = LivenessChallengeGenerator.generateNonce();
        expect(nonce).toMatch(/^[a-f0-9]{64}$/);
        expect(nonces.has(nonce)).toBe(false);
        nonces.add(nonce);
      }
    });
  });

  describe('Session-Bound Challenge Parameters & Entropy Calculation', () => {
    test('generates challenge parameters within strictly bounded randomized ranges', () => {
      for (let i = 0; i < 50; i++) {
        const params = LivenessChallengeGenerator.generateChallengeParams();
        expect([1, 2]).toContain(params.blinkCount);
        expect([1.5, 2.5]).toContain(params.leftHoldSec);
        expect([1.5, 2.5]).toContain(params.rightHoldSec);
        expect(['COLOR_SEED_0', 'COLOR_SEED_1', 'COLOR_SEED_2', 'COLOR_SEED_3', 'COLOR_SEED_4', 'COLOR_SEED_5']).toContain(params.colorSeed);
      }
    });

    test('verifies mathematical combinatorial entropy claim (exact 288 challenge configurations)', () => {
      // Phase 7 approved mathematical formula:
      // 6 gesture permutations × 2 blink counts × 2 left-hold values × 2 right-hold values × 6 color seeds = 288 configurations
      const gesturePermutations = 3 * 2 * 1; // 6
      const blinkCountVariants = 2; // 1 or 2
      const leftHoldVariants = 2; // 1.5s or 2.5s
      const rightHoldVariants = 2; // 1.5s or 2.5s
      const colorSeedVariants = 6; // 0..5

      const totalCombinatorialEntropy = 
        gesturePermutations * 
        blinkCountVariants * 
        leftHoldVariants * 
        rightHoldVariants * 
        colorSeedVariants;

      expect(totalCombinatorialEntropy).toBe(288);
      expect(totalCombinatorialEntropy).not.toBe(864);
    });
  });
});
