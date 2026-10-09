import crypto from 'node:crypto';
import { LivenessChallengeType } from './IdentityEnums.js';
import { ChallengeParameters, LivenessChallengeSession } from './IdentityInterfaces.js';

export class LivenessChallengeGenerator {
  public static readonly SESSION_TTL_SECONDS = 300; // 5 minutes

  /**
   * Generates a 3-gesture permutation using Fisher-Yates shuffle with crypto.randomInt.
   */
  public static generateChallengeSequence(): LivenessChallengeType[] {
    const baseChallenges: LivenessChallengeType[] = [
      LivenessChallengeType.NATURAL_BLINK,
      LivenessChallengeType.HEAD_TURN_LEFT,
      LivenessChallengeType.HEAD_TURN_RIGHT,
    ];

    const challengeSequence = [...baseChallenges];
    for (let i = challengeSequence.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [challengeSequence[i], challengeSequence[j]] = [challengeSequence[j], challengeSequence[i]];
    }
    return challengeSequence;
  }

  /**
   * Generates a 64-character hexadecimal session nonce (32 cryptographically secure bytes).
   */
  public static generateNonce(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generates session-specific dynamic parameters.
   * Total configurations: 6 permutations * 2 blink counts * 2 left holds * 2 right holds * 6 color seeds = 288 configurations.
   */
  public static generateChallengeParams(): ChallengeParameters {
    const blinkCount: 1 | 2 = crypto.randomInt(0, 2) === 0 ? 1 : 2;
    const leftHoldSec: 1.5 | 2.5 = crypto.randomInt(0, 2) === 0 ? 1.5 : 2.5;
    const rightHoldSec: 1.5 | 2.5 = crypto.randomInt(0, 2) === 0 ? 1.5 : 2.5;
    const colorSeedIndex = crypto.randomInt(0, 6);
    const colorSeed = `COLOR_SEED_${colorSeedIndex}`;

    return {
      blinkCount,
      leftHoldSec,
      rightHoldSec,
      colorSeed,
    };
  }

  /**
   * Generates a cryptographically unpredictable challenge session.
   */
  public static generateSession(): LivenessChallengeSession {
    const challengeSequence = this.generateChallengeSequence();
    const challengeParams = this.generateChallengeParams();
    const sessionId = crypto.randomUUID();
    const sessionNonce = this.generateNonce();
    const expiresAt = new Date(Date.now() + this.SESSION_TTL_SECONDS * 1000);

    return {
      sessionId,
      sessionNonce,
      challengeSequence,
      challengeParams,
      expiresAt,
      ttlSeconds: this.SESSION_TTL_SECONDS,
    };
  }

  /**
   * Validates that a challenge sequence is a valid 3-gesture permutation.
   */
  public static isValidSequence(sequence: LivenessChallengeType[]): boolean {
    if (!Array.isArray(sequence) || sequence.length !== 3) return false;
    const set = new Set(sequence);
    return set.size === 3 &&
      set.has(LivenessChallengeType.NATURAL_BLINK) &&
      set.has(LivenessChallengeType.HEAD_TURN_LEFT) &&
      set.has(LivenessChallengeType.HEAD_TURN_RIGHT);
  }
}
