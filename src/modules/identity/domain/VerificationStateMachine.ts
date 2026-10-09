import { 
  VerificationStatus, 
  StudentAccountStatus, 
  UserRole,
  VerificationRejectionReason 
} from './IdentityEnums.js';
import { ConflictError, ValidationError } from '../../../shared/errors/DomainErrors.js';

export interface OrderingEligibilityCheck {
  eligible: boolean;
  reasonCode?: string;
  message?: string;
}

export class VerificationStateMachine {
  /**
   * Authoritative graph of permitted transitions between student verification states.
   * 
   * PENDING_SUBMISSION -> UNDER_REVIEW -> ACTIVE
   *                    -> REJECTED -> PENDING_SUBMISSION (re-submission)
   * ACTIVE <-> SUSPENDED
   */
  private static readonly PERMITTED_TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
    [VerificationStatus.PENDING_SUBMISSION]: [
      VerificationStatus.UNDER_REVIEW,
    ],
    [VerificationStatus.UNDER_REVIEW]: [
      VerificationStatus.ACTIVE,
      VerificationStatus.REJECTED,
    ],
    [VerificationStatus.ACTIVE]: [
      VerificationStatus.SUSPENDED,
    ],
    [VerificationStatus.REJECTED]: [
      VerificationStatus.PENDING_SUBMISSION,
      VerificationStatus.UNDER_REVIEW,
    ],
    [VerificationStatus.SUSPENDED]: [
      VerificationStatus.ACTIVE,
    ],
  };

  /**
   * Checks whether a verification state transition is valid.
   */
  public static canTransition(from: VerificationStatus, to: VerificationStatus): boolean {
    const permitted = this.PERMITTED_TRANSITIONS[from];
    return permitted ? permitted.includes(to) : false;
  }

  /**
   * Asserts that a verification transition is strictly valid; throws ConflictError otherwise.
   */
  public static assertValidTransition(from: VerificationStatus, to: VerificationStatus): void {
    if (!this.canTransition(from, to)) {
      throw new ConflictError(
        `Invalid student verification transition from ${from} to ${to}. Arbitrary state jumps are strictly forbidden.`
      );
    }
  }

  /**
   * Evaluates overall ordering eligibility based on the 4 architectural pillars:
   * 1. Authentication State: User account exists & isActive is true
   * 2. Role Authorization: User role is STUDENT
   * 3. Account Lifecycle State: StudentProfile.accountStatus is ACTIVE
   * 4. Verification State: StudentVerification.status is ACTIVE or APPROVED
   */
  public static checkOrderingEligibility(params: {
    userIsActive: boolean;
    role: UserRole;
    accountStatus: StudentAccountStatus;
    verificationStatus?: VerificationStatus | null;
  }): OrderingEligibilityCheck {
    if (!params.userIsActive) {
      return {
        eligible: false,
        reasonCode: 'USER_ACCOUNT_INACTIVE',
        message: 'User account has been deactivated or disabled at the platform level.',
      };
    }

    if (params.role !== UserRole.STUDENT) {
      return {
        eligible: false,
        reasonCode: 'ROLE_NOT_STUDENT',
        message: 'Only student accounts are eligible for student meal ordering.',
      };
    }

    if (params.accountStatus === StudentAccountStatus.SUSPENDED) {
      return {
        eligible: false,
        reasonCode: 'STUDENT_ACCOUNT_SUSPENDED',
        message: 'Student account has been administratively suspended. Ordering is prohibited.',
      };
    }

    if (params.accountStatus === StudentAccountStatus.REJECTED) {
      return {
        eligible: false,
        reasonCode: 'STUDENT_VERIFICATION_REJECTED',
        message: 'Student verification was rejected. Please re-submit a valid university identity document.',
      };
    }

    if (params.accountStatus !== StudentAccountStatus.ACTIVE) {
      return {
        eligible: false,
        reasonCode: 'STUDENT_VERIFICATION_REQUIRED',
        message: 'Student account is pending verification. Identity document approval is required before ordering.',
      };
    }

    if (
      params.verificationStatus &&
      params.verificationStatus !== VerificationStatus.ACTIVE
    ) {
      return {
        eligible: false,
        reasonCode: 'STUDENT_VERIFICATION_REQUIRED',
        message: 'Student verification is not active. Current verification status is ' + params.verificationStatus,
      };
    }

    return { eligible: true };
  }

  /**
   * Validates structured rejection reason codes.
   */
  public static assertValidRejectionReason(reasonCode: string): VerificationRejectionReason {
    const validCodes = Object.values(VerificationRejectionReason);
    if (!validCodes.includes(reasonCode as VerificationRejectionReason)) {
      throw new ValidationError(
        `Invalid rejection reason code: "${reasonCode}". Permitted codes: ${validCodes.join(', ')}`
      );
    }
    return reasonCode as VerificationRejectionReason;
  }
}
