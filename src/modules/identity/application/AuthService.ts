import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { TokenService, AuthTokens } from '../domain/TokenService.js';
import { UserRole, StudentAccountStatus } from '../domain/IdentityEnums.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../../shared/errors/DomainErrors.js';
import { IAuditLogRepository } from '../../audit/domain/IAuditLogRepository.js';
import { AuditActionType } from '../../audit/domain/AuditEnums.js';

export interface UserResponseDTO {
  id: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  isActive: boolean;
  studentProfile?: {
    id: string;
    fullName: string;
    universityRegNumber: string;
    accountStatus: string;
  } | null;
  staffAccount?: {
    id: string;
    stallId: string;
  } | null;
  ownedStalls?: { id: string }[];
}

export interface AuthResponseDTO {
  user: UserResponseDTO;
  tokens: AuthTokens;
}

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

export class AuthService {
  // Precomputed dummy hash to prevent timing attacks when user does not exist
  private static readonly DUMMY_HASH = '$2b$12$e8xHqK1vU9c4nK7fF0aNuu7g0dJbZ1vN0V3jH8iS6mD2kW5qR9ePi';

  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo?: IAuditLogRepository
  ) {}

  public async registerStudent(
    params: {
      email: string;
      password: string;
      phoneNumber: string;
      fullName: string;
      universityRegNumber: string;
    },
    metadata?: SessionMetadata
  ): Promise<AuthResponseDTO> {
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: params.email.toLowerCase() },
    });
    if (existingEmail) {
      throw new ConflictError('An account with this email address already exists.');
    }

    const existingPhone = await this.prisma.user.findUnique({
      where: { phoneNumber: params.phoneNumber },
    });
    if (existingPhone) {
      throw new ConflictError('An account with this phone number already exists.');
    }

    const existingReg = await this.prisma.studentProfile.findUnique({
      where: { universityRegNumber: params.universityRegNumber },
    });
    if (existingReg) {
      throw new ConflictError('This university registration number is already registered.');
    }

    const passwordHash = await TokenService.hashPassword(params.password);
    const userId = crypto.randomUUID();

    // Atomic creation of User + StudentProfile in PostgreSQL
    const created = await this.prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: {
          id: userId,
          email: params.email.toLowerCase(),
          phoneNumber: params.phoneNumber,
          passwordHash,
          role: UserRole.STUDENT,
          isActive: true,
        },
      });

      const profile = await tx.studentProfile.create({
        data: {
          userId: user.id,
          fullName: params.fullName,
          universityRegNumber: params.universityRegNumber,
          accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
        },
      });

      return { user, profile };
    });

    const userDto: UserResponseDTO = {
      id: created.user.id,
      email: created.user.email,
      phoneNumber: created.user.phoneNumber,
      role: created.user.role as UserRole,
      isActive: created.user.isActive,
      studentProfile: {
        id: created.profile.id,
        fullName: created.profile.fullName,
        universityRegNumber: created.profile.universityRegNumber,
        accountStatus: created.profile.accountStatus,
      },
      ownedStalls: [],
    };

    const tokens = TokenService.generateTokens({
      userId: userDto.id,
      role: userDto.role,
      email: userDto.email,
    });

    // Create server-side RefreshSession with SHA-256 token hash (never plaintext)
    const tokenHash = TokenService.hashToken(tokens.refreshToken);
    const familyId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: userDto.id,
        tokenHash,
        familyId,
        expiresAt,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      },
    });

    return { user: userDto, tokens };
  }

  public async login(
    identifier: string, 
    password: string, 
    metadata?: SessionMetadata
  ): Promise<AuthResponseDTO> {
    const isEmail = identifier.includes('@');
    const user = await this.prisma.user.findFirst({
      where: isEmail
        ? { email: identifier.toLowerCase() }
        : { phoneNumber: identifier },
      include: {
        studentProfile: true,
        staffAccount: true,
        ownedStalls: { select: { id: true } },
      },
    });

    // Anti-enumeration: execute dummy hash comparison if user not found
    if (!user) {
      await TokenService.comparePassword(password, AuthService.DUMMY_HASH);
      throw new UnauthorizedError('Invalid credentials');
    }

    const isMatch = await TokenService.comparePassword(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.isActive || user.deletedAt) {
      throw new UnauthorizedError('Account is inactive or suspended');
    }

    const userDto: UserResponseDTO = {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
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
      } : null,
      ownedStalls: user.ownedStalls || [],
    };

    const tokens = TokenService.generateTokens({
      userId: userDto.id,
      role: userDto.role,
      email: userDto.email,
    });

    // Persist server-side RefreshSession (SHA-256 hashed)
    const tokenHash = TokenService.hashToken(tokens.refreshToken);
    const familyId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash,
        familyId,
        expiresAt,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
      },
    });

    if (this.auditRepo) {
      await this.auditRepo.append({
        actorId: user.id,
        actionType: AuditActionType.AUTH_LOGIN_SUCCESS,
        targetEntity: 'RefreshSession',
        targetId: sessionId,
        newValue: { sessionFamily: familyId, userAgent: metadata?.userAgent },
        reason: 'User authenticated successfully',
      });
    }

    return { user: userDto, tokens };
  }

  /**
   * Refreshes access token and rotates refresh token.
   * If an already-rotated or revoked token is reused, triggers token family invalidation.
   */
  public async refreshTokens(
    refreshToken: string, 
    metadata?: SessionMetadata
  ): Promise<{ user: UserResponseDTO; tokens: AuthTokens }> {
    // 1. Verify HMAC signature and structure
    TokenService.verifyRefreshToken(refreshToken);

    // 2. Hash token to look up session (never query by plaintext)
    const tokenHash = TokenService.hashToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { 
        user: {
          include: {
            studentProfile: true,
            staffAccount: true,
            ownedStalls: { select: { id: true } },
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // 3. REPLAY ATTACK DETECTION: If session was already revoked or replaced, invalidate entire family
    if (session.revokedAt !== null || session.replacedBySessionId !== null) {
      await this.prisma.refreshSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (this.auditRepo) {
        await this.auditRepo.append({
          actorId: session.userId,
          actionType: AuditActionType.AUTH_REPLAY_DETECTED,
          targetEntity: 'RefreshSession',
          targetId: session.id,
          newValue: { familyId: session.familyId, alert: 'Replay detected; entire family revoked' },
          reason: 'Attempted reuse of already-rotated refresh token',
        });
      }

      throw new UnauthorizedError('Revoked or replayed refresh token. Session family invalidated.');
    }

    // 4. Expiration check
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // 5. User active check
    if (!session.user.isActive || session.user.deletedAt) {
      throw new UnauthorizedError('User account is inactive or revoked');
    }

    // 6. Generate new token pair
    const newTokens = TokenService.generateTokens({
      userId: session.user.id,
      role: session.user.role as UserRole,
      email: session.user.email,
    });

    const newTokenHash = TokenService.hashToken(newTokens.refreshToken);
    const newSessionId = crypto.randomUUID();
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 7. Atomic rotation: Revoke current session, record replacement, and create new session in same family
    await this.prisma.$transaction(async tx => {
      await tx.refreshSession.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          replacedBySessionId: newSessionId,
        },
      });

      await tx.refreshSession.create({
        data: {
          id: newSessionId,
          userId: session.userId,
          tokenHash: newTokenHash,
          familyId: session.familyId,
          expiresAt: newExpiresAt,
          userAgent: metadata?.userAgent,
          ipAddress: metadata?.ipAddress,
        },
      });
    });

    if (this.auditRepo) {
      await this.auditRepo.append({
        actorId: session.userId,
        actionType: AuditActionType.AUTH_TOKEN_ROTATED,
        targetEntity: 'RefreshSession',
        targetId: newSessionId,
        newValue: { previousSessionId: session.id, familyId: session.familyId },
        reason: 'Refresh token rotated successfully',
      });
    }

    const userDto = this.toUserResponseDTO(session.user);
    return { user: userDto, tokens: newTokens };
  }

  /**
   * Server-side logout: revokes the authenticated refresh session or all active sessions for user.
   */
  public async logout(params: { userId?: string; refreshToken?: string; ipAddress?: string }): Promise<void> {
    if (params.refreshToken) {
      const tokenHash = TokenService.hashToken(params.refreshToken);
      const session = await this.prisma.refreshSession.findUnique({
        where: { tokenHash },
      });

      if (session && !session.revokedAt) {
        await this.prisma.refreshSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });

        if (this.auditRepo) {
          await this.auditRepo.append({
            actorId: session.userId,
            actionType: AuditActionType.AUTH_LOGOUT,
            targetEntity: 'RefreshSession',
            targetId: session.id,
            reason: 'User logged out and revoked refresh session',
          });
        }
      }
    } else if (params.userId) {
      await this.prisma.refreshSession.updateMany({
        where: { userId: params.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (this.auditRepo) {
        await this.auditRepo.append({
          actorId: params.userId,
          actionType: AuditActionType.AUTH_LOGOUT,
          targetEntity: 'RefreshSession',
          targetId: params.userId,
          reason: 'User logged out all active refresh sessions',
        });
      }
    }
  }

  public async getCurrentUser(userId: string): Promise<UserResponseDTO> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: true,
        staffAccount: true,
        ownedStalls: { select: { id: true } },
      },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundError('User could not be found');
    }

    return {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
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
      } : null,
      ownedStalls: user.ownedStalls || [],
    };
  }

  private toUserResponseDTO(user: any): UserResponseDTO {
    return {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
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
      } : null,
      ownedStalls: user.ownedStalls || [],
    };
  }
}
