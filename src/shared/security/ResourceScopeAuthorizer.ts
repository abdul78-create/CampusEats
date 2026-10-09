import { ForbiddenError } from '../errors/DomainErrors.js';
import { UserRole } from '../../modules/identity/domain/IdentityEnums.js';
import { StaffPermissionType } from '../../modules/stall/domain/StallEnums.js';

export interface AuthenticatedUserContext {
  userId: string;
  role: UserRole;
  staffStallId?: string | null;
  staffPermissions?: StaffPermissionType[];
  ownedStallIds?: string[];
}

/**
 * Enforces Role + Permission + Resource Scope (BOLA / IDOR Defense)
 */
export class ResourceScopeAuthorizer {
  /**
   * Asserts that a student can only access resources belonging to their own userId.
   */
  public static assertStudentResourceOwnership(
    user: AuthenticatedUserContext, 
    resourceOwnerStudentId: string,
    actionDescription = 'access this resource'
  ): void {
    if (user.role === UserRole.ADMIN) {
      return; // Admins have platform-wide oversight
    }

    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenError(`Only students or admins can ${actionDescription}`);
    }

    if (user.userId !== resourceOwnerStudentId) {
      throw new ForbiddenError(
        `IDOR Violation: Student ${user.userId} is not authorized to ${actionDescription} belonging to student ${resourceOwnerStudentId}`
      );
    }
  }

  /**
   * Asserts that an actor has ownership or authorized staff scope over a specific stall.
   */
  public static assertStallScope(
    user: AuthenticatedUserContext, 
    targetStallId: string,
    requiredPermission?: StaffPermissionType,
    actionDescription = 'manage this stall'
  ): void {
    if (user.role === UserRole.ADMIN) {
      return; // Admins have platform-wide authority
    }

    if (user.role === UserRole.STALL_OWNER) {
      const isOwner = user.ownedStallIds && user.ownedStallIds.includes(targetStallId);
      if (!isOwner) {
        throw new ForbiddenError(
          `BOLA Violation: Stall Owner ${user.userId} does not own stall ${targetStallId} and cannot ${actionDescription}`
        );
      }
      return;
    }

    if (user.role === UserRole.STALL_STAFF) {
      if (user.staffStallId !== targetStallId) {
        throw new ForbiddenError(
          `BOLA Violation: Staff member ${user.userId} is assigned to stall ${user.staffStallId || 'none'}, not stall ${targetStallId}`
        );
      }

      if (requiredPermission && (!user.staffPermissions || !user.staffPermissions.includes(requiredPermission))) {
        throw new ForbiddenError(
          `Permission Denied: Staff member lacks required permission [${requiredPermission}] to ${actionDescription}`
        );
      }
      return;
    }

    throw new ForbiddenError(`Role ${user.role} is not authorized to ${actionDescription}`);
  }

  /**
   * Asserts that an actor is authorized to mark an order as COLLECTED.
   * Strictly prohibits STUDENTS from mutating collection state.
   */
  public static assertCanMarkOrderCollected(
    user: AuthenticatedUserContext,
    orderStallId: string
  ): void {
    if (user.role === UserRole.STUDENT) {
      throw new ForbiddenError('Students are strictly prohibited from mutating order collection state');
    }

    this.assertStallScope(user, orderStallId, StaffPermissionType.MANAGE_ORDERS, 'mark sub-order as COLLECTED');
  }

  /**
   * Asserts that an actor is authorized to record a counter cash/terminal payment.
   * Students cannot self-declare cash payments.
   */
  public static assertCanRecordCounterPayment(
    user: AuthenticatedUserContext,
    orderStallId: string
  ): void {
    if (user.role === UserRole.STUDENT) {
      throw new ForbiddenError('Students cannot self-declare counter payments');
    }

    this.assertStallScope(user, orderStallId, StaffPermissionType.VIEW_PAYMENTS, 'record counter balance settlement');
  }

  /**
   * Asserts that an actor has direct administrative refund authority.
   * Stall owners cannot arbitrarily issue refunds against historical orders.
   */
  public static assertCanExecuteAdministrativeRefund(
    user: AuthenticatedUserContext
  ): void {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenError('Only platform administrators possess direct administrative refund authority');
    }
  }

  /**
   * Asserts that an actor is authorized to modify official stall operating hours.
   * Stall owners cannot manipulate official operating hours; only admins can.
   */
  public static assertCanConfigureOperatingHours(
    user: AuthenticatedUserContext
  ): void {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenError('Only platform administrators can configure official stall operating hours');
    }
  }
}
