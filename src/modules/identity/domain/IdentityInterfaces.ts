import { 
  UserRole, 
  StudentAccountStatus, 
  VerificationStatus, 
  LivenessChallengeType,
  LivenessDecision
} from './IdentityEnums.js';

export interface UserProps {
  id: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentProfileProps {
  id: string;
  userId: string;
  fullName: string;
  universityRegNumber: string;
  profilePhotoUrl?: string | null;
  accountStatus: StudentAccountStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdentityDocumentProps {
  id: string;
  verificationId: string;
  documentType: string;
  fileStoragePath: string;
  fileMimeType: string;
  fileSizeBytes: number;
  fileSha256Checksum: string;
  createdAt: Date;
}

export interface LivenessVerificationProps {
  id: string;
  verificationId: string;
  providerName: string;
  providerSessionId?: string | null;
  naturalBlinkPassed: boolean;
  headTurnLeftPassed: boolean;
  headTurnRightPassed: boolean;
  confidenceScore?: number | null;
  isLiveHuman: boolean;
  consecutiveFailures: number;
  lastFailureAt?: Date | null;
  lockedUntil?: Date | null;
  evidenceStoragePath?: string | null;
  verifiedAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}

export interface StudentVerificationProps {
  id: string;
  studentProfileId: string;
  status: VerificationStatus;
  rejectionReason?: string | null;
  reviewedByAdminId?: string | null;
  reviewedAt?: Date | null;
  identityDocument?: IdentityDocumentProps | null;
  livenessVerification?: LivenessVerificationProps | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChallengeParameters {
  blinkCount: 1 | 2;
  leftHoldSec: 1.5 | 2.5;
  rightHoldSec: 1.5 | 2.5;
  colorSeed: string;
}

export interface LivenessChallengeSession {
  sessionId: string;
  sessionNonce: string;
  challengeSequence: LivenessChallengeType[];
  challengeParams: ChallengeParameters;
  expiresAt: Date;
  ttlSeconds: number;
}

export interface EvaluateLivenessInput {
  sessionId: string;
  sessionNonce: string;
  expectedSequence: LivenessChallengeType[];
  expectedParams: ChallengeParameters;
  videoBuffer: Buffer;
  mimeType: string;
}

export interface ProviderLivenessResult {
  decision: LivenessDecision;
  confidenceScore: number;
  detectedSequence: LivenessChallengeType[];
  sequenceOrderSatisfied: boolean;
  parametersSatisfied: boolean;
  videoDurationMs: number;
  providerReference: string;
  message?: string;
}

export interface LivenessStatusDto {
  hasCompletedLiveness: boolean;
  isLiveHuman: boolean;
  consecutiveFailures: number;
  isLocked: boolean;
  lockedUntil?: Date | null;
  verifiedAt?: Date | null;
}
