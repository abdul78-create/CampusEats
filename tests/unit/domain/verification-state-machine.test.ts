import { VerificationStateMachine } from '../../../src/modules/identity/domain/VerificationStateMachine.js';
import { 
  VerificationStatus, 
  StudentAccountStatus, 
  UserRole, 
  VerificationRejectionReason 
} from '../../../src/modules/identity/domain/IdentityEnums.js';
import { ConflictError, ValidationError } from '../../../src/shared/errors/DomainErrors.js';

describe('VerificationStateMachine & Ordering Eligibility', () => {
  describe('Lifecycle State Transitions', () => {
    test('allows valid progression: PENDING_SUBMISSION -> UNDER_REVIEW -> ACTIVE', () => {
      expect(VerificationStateMachine.canTransition(VerificationStatus.PENDING_SUBMISSION, VerificationStatus.UNDER_REVIEW)).toBe(true);
      expect(VerificationStateMachine.canTransition(VerificationStatus.UNDER_REVIEW, VerificationStatus.ACTIVE)).toBe(true);
    });

    test('allows rejection and re-submission path: UNDER_REVIEW -> REJECTED -> PENDING_SUBMISSION / UNDER_REVIEW', () => {
      expect(VerificationStateMachine.canTransition(VerificationStatus.UNDER_REVIEW, VerificationStatus.REJECTED)).toBe(true);
      expect(VerificationStateMachine.canTransition(VerificationStatus.REJECTED, VerificationStatus.PENDING_SUBMISSION)).toBe(true);
      expect(VerificationStateMachine.canTransition(VerificationStatus.REJECTED, VerificationStatus.UNDER_REVIEW)).toBe(true);
    });

    test('allows administrative suspension and reactivation: ACTIVE -> SUSPENDED -> ACTIVE', () => {
      expect(VerificationStateMachine.canTransition(VerificationStatus.ACTIVE, VerificationStatus.SUSPENDED)).toBe(true);
      expect(VerificationStateMachine.canTransition(VerificationStatus.SUSPENDED, VerificationStatus.ACTIVE)).toBe(true);
    });

    test('strictly rejects invalid arbitrary state jumps', () => {
      // ACTIVE cannot jump to UNDER_REVIEW
      expect(VerificationStateMachine.canTransition(VerificationStatus.ACTIVE, VerificationStatus.UNDER_REVIEW)).toBe(false);
      expect(() => {
        VerificationStateMachine.assertValidTransition(VerificationStatus.ACTIVE, VerificationStatus.UNDER_REVIEW);
      }).toThrow(ConflictError);

      // ACTIVE cannot jump back to PENDING_SUBMISSION
      expect(VerificationStateMachine.canTransition(VerificationStatus.ACTIVE, VerificationStatus.PENDING_SUBMISSION)).toBe(false);

      // PENDING_SUBMISSION cannot bypass review straight to ACTIVE
      expect(VerificationStateMachine.canTransition(VerificationStatus.PENDING_SUBMISSION, VerificationStatus.ACTIVE)).toBe(false);

      // REJECTED cannot jump to ACTIVE without review
      expect(VerificationStateMachine.canTransition(VerificationStatus.REJECTED, VerificationStatus.ACTIVE)).toBe(false);

      // SUSPENDED cannot jump to UNDER_REVIEW
      expect(VerificationStateMachine.canTransition(VerificationStatus.SUSPENDED, VerificationStatus.UNDER_REVIEW)).toBe(false);
    });
  });

  describe('Ordering Eligibility Evaluation (4 Pillars)', () => {
    test('eligibility is granted when user is active, student role, account ACTIVE, and verification ACTIVE', () => {
      const result = VerificationStateMachine.checkOrderingEligibility({
        userIsActive: true,
        role: UserRole.STUDENT,
        accountStatus: StudentAccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.ACTIVE,
      });

      expect(result.eligible).toBe(true);
      expect(result.reasonCode).toBeUndefined();
    });

    test('eligibility is rejected when user account is inactive', () => {
      const result = VerificationStateMachine.checkOrderingEligibility({
        userIsActive: false,
        role: UserRole.STUDENT,
        accountStatus: StudentAccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.ACTIVE,
      });

      expect(result.eligible).toBe(false);
      expect(result.reasonCode).toBe('USER_ACCOUNT_INACTIVE');
    });

    test('eligibility is rejected when user is not a student', () => {
      const result = VerificationStateMachine.checkOrderingEligibility({
        userIsActive: true,
        role: UserRole.STALL_OWNER,
        accountStatus: StudentAccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.ACTIVE,
      });

      expect(result.eligible).toBe(false);
      expect(result.reasonCode).toBe('ROLE_NOT_STUDENT');
    });

    test('eligibility is rejected when student is SUSPENDED', () => {
      const result = VerificationStateMachine.checkOrderingEligibility({
        userIsActive: true,
        role: UserRole.STUDENT,
        accountStatus: StudentAccountStatus.SUSPENDED,
        verificationStatus: VerificationStatus.SUSPENDED,
      });

      expect(result.eligible).toBe(false);
      expect(result.reasonCode).toBe('STUDENT_ACCOUNT_SUSPENDED');
    });

    test('eligibility is rejected when student is REJECTED', () => {
      const result = VerificationStateMachine.checkOrderingEligibility({
        userIsActive: true,
        role: UserRole.STUDENT,
        accountStatus: StudentAccountStatus.REJECTED,
        verificationStatus: VerificationStatus.REJECTED,
      });

      expect(result.eligible).toBe(false);
      expect(result.reasonCode).toBe('STUDENT_VERIFICATION_REJECTED');
    });

    test('eligibility is rejected when student verification is PENDING_VERIFICATION', () => {
      const result = VerificationStateMachine.checkOrderingEligibility({
        userIsActive: true,
        role: UserRole.STUDENT,
        accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
        verificationStatus: VerificationStatus.UNDER_REVIEW,
      });

      expect(result.eligible).toBe(false);
      expect(result.reasonCode).toBe('STUDENT_VERIFICATION_REQUIRED');
    });
  });

  describe('Structured Rejection Reason Code Validation', () => {
    test('accepts all authoritative rejection reason codes', () => {
      const valid = [
        VerificationRejectionReason.INVALID_DOCUMENT,
        VerificationRejectionReason.DOCUMENT_UNREADABLE,
        VerificationRejectionReason.WRONG_DOCUMENT_TYPE,
        VerificationRejectionReason.IDENTITY_MISMATCH,
        VerificationRejectionReason.EXPIRED_DOCUMENT,
        VerificationRejectionReason.INSUFFICIENT_INFORMATION,
        VerificationRejectionReason.DUPLICATE_SUBMISSION,
        VerificationRejectionReason.OTHER,
      ];

      for (const code of valid) {
        expect(VerificationStateMachine.assertValidRejectionReason(code)).toBe(code);
      }
    });

    test('rejects arbitrary, non-standard reason codes with ValidationError', () => {
      expect(() => {
        VerificationStateMachine.assertValidRejectionReason('NOT_A_STUDENT_PROBABLY');
      }).toThrow(ValidationError);
    });
  });
});
