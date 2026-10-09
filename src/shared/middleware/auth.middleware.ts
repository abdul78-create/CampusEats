import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../../modules/identity/domain/TokenService.js';
import { UserRole, StudentAccountStatus } from '../../modules/identity/domain/IdentityEnums.js';
import { 
  UnauthorizedError, 
  ForbiddenError, 
  UnverifiedStudentError 
} from '../errors/DomainErrors.js';
import { PrismaService } from '../infrastructure/PrismaService.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Authentication token is required'));
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = TokenService.verifyAccessToken(token);

    // Look up user from database to ensure not deactivated or soft-deleted
    const prisma = PrismaService.getClient();
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        studentProfile: true,
        staffAccount: {
          include: {
            permissions: true,
          },
        },
        ownedStalls: { select: { id: true } },
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      next(new UnauthorizedError('User account is invalid or inactive'));
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      isActive: user.isActive,
      studentProfile: user.studentProfile ? {
        id: user.studentProfile.id,
        fullName: user.studentProfile.fullName,
        universityRegNumber: user.studentProfile.universityRegNumber,
        accountStatus: user.studentProfile.accountStatus,
      } : null,
      staffAccount: user.staffAccount ? {
        id: user.staffAccount.id,
        stallId: user.staffAccount.stallId,
        permissions: user.staffAccount.permissions.map(p => p.permission),
      } : null,
      ownedStalls: user.ownedStalls || [],
    };

    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = TokenService.verifyAccessToken(token);
    const prisma = PrismaService.getClient();
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        studentProfile: true,
        staffAccount: {
          include: {
            permissions: true,
          },
        },
        ownedStalls: { select: { id: true } },
      },
    });

    if (user && user.isActive && !user.deletedAt) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
        isActive: user.isActive,
        studentProfile: user.studentProfile ? {
          id: user.studentProfile.id,
          fullName: user.studentProfile.fullName,
          universityRegNumber: user.studentProfile.universityRegNumber,
          accountStatus: user.studentProfile.accountStatus,
        } : null,
        staffAccount: user.staffAccount ? {
          id: user.staffAccount.id,
          stallId: user.staffAccount.stallId,
          permissions: user.staffAccount.permissions.map(p => p.permission),
        } : null,
        ownedStalls: user.ownedStalls || [],
      };
    }
    next();
  } catch {
    // If token invalid/expired, continue without req.user
    next();
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError(`Access denied: Requires one of [${roles.join(', ')}] role`));
      return;
    }

    next();
  };
}

export function requireVerifiedStudent(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  if (req.user.role !== UserRole.STUDENT) {
    next(new ForbiddenError('Only student accounts can perform this action'));
    return;
  }

  if (req.user.studentProfile?.accountStatus !== StudentAccountStatus.ACTIVE) {
    next(new UnverifiedStudentError('Student account must be verified and active to perform this action'));
    return;
  }

  next();
}

export function requirePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    // Admins and Stall Owners of their own stall bypass granular staff checks
    if (req.user.role === UserRole.ADMIN || req.user.role === UserRole.STALL_OWNER) {
      next();
      return;
    }

    if (req.user.role !== UserRole.STALL_STAFF) {
      next(new ForbiddenError('Only stall staff or owners can perform this action'));
      return;
    }

    const userPermissions = req.user.staffAccount?.permissions || [];
    const hasAll = permissions.every(p => userPermissions.includes(p));

    if (!hasAll) {
      next(new ForbiddenError(`Missing delegated staff permission: [${permissions.join(', ')}]`));
      return;
    }

    next();
  };
}
