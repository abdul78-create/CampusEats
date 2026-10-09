import { ResourceScopeAuthorizer, AuthenticatedUserContext } from '../../../src/shared/security/ResourceScopeAuthorizer.js';
import { UserRole } from '../../../src/modules/identity/domain/IdentityEnums.js';
import { StaffPermissionType, StallStatus } from '../../../src/modules/stall/domain/StallEnums.js';
import { StallOperatingPolicy } from '../../../src/modules/stall/domain/StallOperatingPolicy.js';
import { ForbiddenError, ValidationError } from '../../../src/shared/errors/DomainErrors.js';

describe('ResourceScopeAuthorizer (Role + Permission + Resource Scope / BOLA & IDOR Defense)', () => {
  const studentUser: AuthenticatedUserContext = {
    userId: 'usr_student_1',
    role: UserRole.STUDENT,
  };

  const studentUser2: AuthenticatedUserContext = {
    userId: 'usr_student_2',
    role: UserRole.STUDENT,
  };

  const ownerStallA: AuthenticatedUserContext = {
    userId: 'usr_owner_a',
    role: UserRole.STALL_OWNER,
    ownedStallIds: ['stall_a'],
  };

  const staffStallA: AuthenticatedUserContext = {
    userId: 'usr_staff_a',
    role: UserRole.STALL_STAFF,
    staffStallId: 'stall_a',
    staffPermissions: [StaffPermissionType.MANAGE_ORDERS],
  };

  const adminUser: AuthenticatedUserContext = {
    userId: 'usr_admin',
    role: UserRole.ADMIN,
  };

  describe('Student Resource Isolation (IDOR Protection)', () => {
    test('allows student to access their own resources', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertStudentResourceOwnership(studentUser, 'usr_student_1');
      }).not.toThrow();
    });

    test('strictly forbids student from accessing another student resources (IDOR)', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertStudentResourceOwnership(studentUser, 'usr_student_2');
      }).toThrow(ForbiddenError);
    });

    test('allows admin to access student resources for support/audit', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertStudentResourceOwnership(adminUser, 'usr_student_2');
      }).not.toThrow();
    });
  });

  describe('Stall Tenant Isolation (BOLA Protection)', () => {
    test('allows stall owner to manage their owned stall', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertStallScope(ownerStallA, 'stall_a');
      }).not.toThrow();
    });

    test('strictly forbids stall owner from accessing or modifying another stall (BOLA)', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertStallScope(ownerStallA, 'stall_b', undefined, 'modify menu');
      }).toThrow(ForbiddenError);
    });

    test('strictly forbids stall owner from modifying another stall inventory', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertStallScope(ownerStallA, 'stall_b', undefined, 'update stock');
      }).toThrow(ForbiddenError);
    });

    test('allows authorized staff to manage orders on assigned stall', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertStallScope(
          staffStallA, 
          'stall_a', 
          StaffPermissionType.MANAGE_ORDERS
        );
      }).not.toThrow();
    });

    test('strictly forbids staff from accessing another stall', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertStallScope(
          staffStallA, 
          'stall_b', 
          StaffPermissionType.MANAGE_ORDERS
        );
      }).toThrow(ForbiddenError);
    });

    test('strictly forbids staff lacking delegated permission from executing restricted action', () => {
      // staffStallA only has MANAGE_ORDERS, not MANAGE_MENU
      expect(() => {
        ResourceScopeAuthorizer.assertStallScope(
          staffStallA, 
          'stall_a', 
          StaffPermissionType.MANAGE_MENU, 
          'alter prices'
        );
      }).toThrow(ForbiddenError);
    });
  });

  describe('Pickup Collection Authorization', () => {
    test('strictly forbids students from marking an order as COLLECTED', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertCanMarkOrderCollected(studentUser, 'stall_a');
      }).toThrow(ForbiddenError);
    });

    test('allows stall owner to mark sub-order as COLLECTED', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertCanMarkOrderCollected(ownerStallA, 'stall_a');
      }).not.toThrow();
    });

    test('allows staff with MANAGE_ORDERS to mark sub-order as COLLECTED on their stall', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertCanMarkOrderCollected(staffStallA, 'stall_a');
      }).not.toThrow();
    });

    test('forbids staff of stall A from marking orders collected on stall B', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertCanMarkOrderCollected(staffStallA, 'stall_b');
      }).toThrow(ForbiddenError);
    });
  });

  describe('Counter Balance Payment Authorization', () => {
    test('strictly forbids student from self-declaring cash counter payments', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertCanRecordCounterPayment(studentUser, 'stall_a');
      }).toThrow(ForbiddenError);
    });

    test('strictly forbids staff lacking VIEW_PAYMENTS from recording counter payment', () => {
      // staffStallA has MANAGE_ORDERS, lacks VIEW_PAYMENTS
      expect(() => {
        ResourceScopeAuthorizer.assertCanRecordCounterPayment(staffStallA, 'stall_a');
      }).toThrow(ForbiddenError);
    });
  });

  describe('Refund Authority Restrictions', () => {
    test('strictly forbids stall owner from executing direct administrative refunds', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertCanExecuteAdministrativeRefund(ownerStallA);
      }).toThrow(ForbiddenError);
    });

    test('allows admin to execute administrative refunds', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertCanExecuteAdministrativeRefund(adminUser);
      }).not.toThrow();
    });
  });

  describe('Operating Hours vs Live Status Authority', () => {
    test('forbids stall owner from configuring official operating hours (admin only)', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertCanConfigureOperatingHours(ownerStallA);
      }).toThrow(ForbiddenError);
    });

    test('allows admin to configure official operating hours', () => {
      expect(() => {
        ResourceScopeAuthorizer.assertCanConfigureOperatingHours(adminUser);
      }).not.toThrow();
    });

    test('system prevents stall from transitioning to OPEN outside configured hours', () => {
      // 09:00 - 17:00 UTC schedule
      const operatingHours = [{
        id: 'h_1',
        stallId: 'stall_a',
        dayOfWeek: 1, // Monday
        openTime: '09:00',
        closeTime: '17:00',
        isClosed: false,
      }];

      // 08:30 UTC on Monday (Outside hours)
      const earlyMorning = new Date('2026-09-21T08:30:00.000Z');

      expect(() => {
        StallOperatingPolicy.assertCanTransitionLiveStatus({
          targetStatus: StallStatus.OPEN,
          currentTime: earlyMorning,
          operatingHours,
        });
      }).toThrow(ValidationError);
    });
  });
});
