import { LivenessDecision } from './IdentityEnums.js';
import { EvaluateLivenessInput, ProviderLivenessResult } from './IdentityInterfaces.js';

/**
 * Validates that the active liveness provider configuration is safe for the current environment.
 * Strictly prevents the mock provider from running in production.
 */
export function validateLivenessProviderConfig(nodeEnv: string = process.env.NODE_ENV || 'development', providerName?: string): void {
  if (nodeEnv === 'production') {
    if (!providerName || providerName.toLowerCase() === 'mock') {
      throw new Error(
        'FATAL SECURITY CONFIGURATION: LIVENESS_PROVIDER="mock" is strictly prohibited in production (NODE_ENV=production). ' +
        'A certified production biometric provider (AWS_REKOGNITION, HYPERVERGE, VERIFF) must be configured.'
      );
    }
  }
}

/**
 * Provider interface for interactive face liveness and anti-spoofing verification.
 */
export interface ILivenessVerificationProvider {
  /**
   * Evaluates the student's temporal video evidence against the session's specific dynamic challenge sequence and parameters.
   */
  evaluateLiveness(input: EvaluateLivenessInput): Promise<ProviderLivenessResult>;
}

// Backward-compatible alias
export type LivenessVerificationProvider = ILivenessVerificationProvider;

/**
 * Development & Automated Test Mock Implementation.
 * 
 * DISCLAIMER & WARNING:
 * This implementation is strictly for local engineering, continuous integration, and test environments.
 * It DOES NOT provide real biometric anti-spoofing defense.
 * In production deployment, a real biometric provider (e.g. AWS Rekognition Face Liveness, Veriff,
 * or HyperVerge) must be configured.
 */
export class MockLivenessVerificationProvider implements ILivenessVerificationProvider {
  constructor(nodeEnv: string = process.env.NODE_ENV || 'development') {
    validateLivenessProviderConfig(nodeEnv, 'mock');
  }

  async evaluateLiveness(input: EvaluateLivenessInput): Promise<ProviderLivenessResult> {
    const videoStr = input.videoBuffer.toString('utf8');

    // 1. Check for explicit test control markers in mock buffer
    if (videoStr.includes('SIMULATE_SPOOF')) {
      return {
        decision: LivenessDecision.SPOOF,
        confidenceScore: 0.25,
        detectedSequence: input.expectedSequence,
        sequenceOrderSatisfied: true,
        parametersSatisfied: false,
        videoDurationMs: 4500,
        providerReference: `mock_spoof_${input.sessionId}`,
        message: 'Presentation attack detected (Simulated synthetic replay/mask)',
      };
    }

    if (videoStr.includes('SIMULATE_REVERSE_SEQUENCE')) {
      const reversed = [...input.expectedSequence].reverse();
      return {
        decision: LivenessDecision.SPOOF,
        confidenceScore: 0.40,
        detectedSequence: reversed,
        sequenceOrderSatisfied: false,
        parametersSatisfied: true,
        videoDurationMs: 4500,
        providerReference: `mock_reverse_${input.sessionId}`,
        message: 'Gesture order mismatch: observed movements do not match session challenge sequence',
      };
    }

    if (videoStr.includes('SIMULATE_WRONG_PARAMS')) {
      return {
        decision: LivenessDecision.SPOOF,
        confidenceScore: 0.50,
        detectedSequence: input.expectedSequence,
        sequenceOrderSatisfied: true,
        parametersSatisfied: false,
        videoDurationMs: 4500,
        providerReference: `mock_bad_params_${input.sessionId}`,
        message: 'Gesture parameters not satisfied: hold duration or blink count failed criteria',
      };
    }

    if (videoStr.includes('SIMULATE_INCONCLUSIVE')) {
      return {
        decision: LivenessDecision.INCONCLUSIVE,
        confidenceScore: 0.60,
        detectedSequence: input.expectedSequence.slice(0, 1),
        sequenceOrderSatisfied: false,
        parametersSatisfied: false,
        videoDurationMs: 4000,
        providerReference: `mock_inconclusive_${input.sessionId}`,
        message: 'Inconclusive: lighting inadequate or face partially occluded',
      };
    }

    if (videoStr.includes('SIMULATE_SHORT_DURATION')) {
      return {
        decision: LivenessDecision.INCONCLUSIVE,
        confidenceScore: 0.30,
        detectedSequence: [],
        sequenceOrderSatisfied: false,
        parametersSatisfied: false,
        videoDurationMs: 1500, // < 3.0s
        providerReference: `mock_short_${input.sessionId}`,
        message: 'Video duration too short to evaluate complete challenge sequence',
      };
    }

    // 2. Default genuine pass for valid video
    return {
      decision: LivenessDecision.LIVE,
      confidenceScore: 0.98,
      detectedSequence: [...input.expectedSequence],
      sequenceOrderSatisfied: true,
      parametersSatisfied: true,
      videoDurationMs: 4500,
      providerReference: `mock_eval_${input.sessionId}`,
      message: 'Mock verification passed (DEVELOPMENT ONLY: NOT PRODUCTION ANTI-SPOOFING)',
    };
  }
}
