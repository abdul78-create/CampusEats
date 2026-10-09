import { describe, test, expect } from '@jest/globals';
import { 
  validateLivenessProviderConfig, 
  MockLivenessVerificationProvider 
} from '../../../src/modules/identity/domain/LivenessVerificationProvider.js';
import { LivenessDecision, LivenessChallengeType } from '../../../src/modules/identity/domain/IdentityEnums.js';

describe('Liveness Provider Configuration & Biometric Evaluation', () => {
  describe('Production Fail-Closed Guardrails', () => {
    test('strictly forbids mock provider in production environment', () => {
      expect(() => {
        validateLivenessProviderConfig('production', 'mock');
      }).toThrow('FATAL SECURITY CONFIGURATION: LIVENESS_PROVIDER="mock" is strictly prohibited in production');

      expect(() => {
        validateLivenessProviderConfig('production', 'MOCK');
      }).toThrow('FATAL SECURITY CONFIGURATION: LIVENESS_PROVIDER="mock" is strictly prohibited in production');

      expect(() => {
        validateLivenessProviderConfig('production', undefined);
      }).toThrow('FATAL SECURITY CONFIGURATION: LIVENESS_PROVIDER="mock" is strictly prohibited in production');
    });

    test('instantiating MockLivenessVerificationProvider in production throws fatal error', () => {
      expect(() => {
        new MockLivenessVerificationProvider('production');
      }).toThrow('FATAL SECURITY CONFIGURATION');
    });

    test('allows certified enterprise providers in production', () => {
      expect(() => {
        validateLivenessProviderConfig('production', 'AWS_REKOGNITION');
      }).not.toThrow();

      expect(() => {
        validateLivenessProviderConfig('production', 'HYPERVERGE');
      }).not.toThrow();

      expect(() => {
        validateLivenessProviderConfig('production', 'VERIFF');
      }).not.toThrow();
    });

    test('allows mock provider in development and test environments', () => {
      expect(() => {
        validateLivenessProviderConfig('development', 'mock');
      }).not.toThrow();

      expect(() => {
        validateLivenessProviderConfig('test', 'mock');
      }).not.toThrow();

      expect(() => {
        new MockLivenessVerificationProvider('test');
      }).not.toThrow();
    });
  });

  describe('Mock Provider Biometric Evaluation Modes', () => {
    const provider = new MockLivenessVerificationProvider('test');
    const expectedSequence = [
      LivenessChallengeType.NATURAL_BLINK,
      LivenessChallengeType.HEAD_TURN_LEFT,
      LivenessChallengeType.HEAD_TURN_RIGHT,
    ];
    const expectedParams = {
      blinkCount: 2,
      leftHoldSec: 2.0,
      rightHoldSec: 1.5,
      colorSeed: 3,
    };

    test('evaluates genuine live human video with high confidence', async () => {
      const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04]);
      const videoBuffer = Buffer.concat([ebmlHeader, Buffer.from('GENUINE_LIVE_STREAM')]);

      const result = await provider.evaluateLiveness({
        sessionId: 'sess_123',
        sessionNonce: 'nonce_abc',
        expectedSequence,
        expectedParams,
        videoBuffer,
        mimeType: 'video/webm',
      });

      expect(result.decision).toBe(LivenessDecision.LIVE);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.80);
      expect(result.sequenceOrderSatisfied).toBe(true);
      expect(result.parametersSatisfied).toBe(true);
      expect(result.detectedSequence).toEqual(expectedSequence);
      expect(result.providerReference).toBeDefined();
    });

    test('detects simulated spoof attack and returns SPOOF decision', async () => {
      const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      const videoBuffer = Buffer.concat([ebmlHeader, Buffer.from('SIMULATE_SPOOF_ATTACK')]);

      const result = await provider.evaluateLiveness({
        sessionId: 'sess_spoof',
        sessionNonce: 'nonce_spoof',
        expectedSequence,
        expectedParams,
        videoBuffer,
        mimeType: 'video/webm',
      });

      expect(result.decision).toBe(LivenessDecision.SPOOF);
      expect(result.confidenceScore).toBeLessThan(0.50);
      expect(result.parametersSatisfied).toBe(false);
    });

    test('detects reverse gesture sequence mismatch and rejects order', async () => {
      const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      const videoBuffer = Buffer.concat([ebmlHeader, Buffer.from('SIMULATE_REVERSE_SEQUENCE')]);

      const result = await provider.evaluateLiveness({
        sessionId: 'sess_rev',
        sessionNonce: 'nonce_rev',
        expectedSequence,
        expectedParams,
        videoBuffer,
        mimeType: 'video/webm',
      });

      expect(result.decision).toBe(LivenessDecision.SPOOF);
      expect(result.sequenceOrderSatisfied).toBe(false);
      expect(result.detectedSequence).toEqual([...expectedSequence].reverse());
    });

    test('detects unsatisfied parameters (insufficient hold duration or blink count)', async () => {
      const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      const videoBuffer = Buffer.concat([ebmlHeader, Buffer.from('SIMULATE_WRONG_PARAMS')]);

      const result = await provider.evaluateLiveness({
        sessionId: 'sess_params',
        sessionNonce: 'nonce_params',
        expectedSequence,
        expectedParams,
        videoBuffer,
        mimeType: 'video/webm',
      });

      expect(result.decision).toBe(LivenessDecision.SPOOF);
      expect(result.parametersSatisfied).toBe(false);
    });

    test('returns INCONCLUSIVE when lighting or face visibility is poor', async () => {
      const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      const videoBuffer = Buffer.concat([ebmlHeader, Buffer.from('SIMULATE_INCONCLUSIVE')]);

      const result = await provider.evaluateLiveness({
        sessionId: 'sess_inc',
        sessionNonce: 'nonce_inc',
        expectedSequence,
        expectedParams,
        videoBuffer,
        mimeType: 'video/webm',
      });

      expect(result.decision).toBe(LivenessDecision.INCONCLUSIVE);
      expect(result.sequenceOrderSatisfied).toBe(false);
      expect(result.parametersSatisfied).toBe(false);
    });
  });
});
