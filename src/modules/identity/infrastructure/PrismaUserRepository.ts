import { PrismaClient } from '@prisma/client';
import { IUserRepository, UserEntityProps } from '../domain/IUserRepository.js';
import { UserRole, StudentAccountStatus } from '../domain/IdentityEnums.js';

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<UserEntityProps | null> {
    const raw = await this.prisma.user.findUnique({
      where: { id },
      include: {
        studentProfile: true,
        staffAccount: true,
        ownedStalls: { select: { id: true } },
      },
    });
    if (!raw) return null;

    return this.mapToDomain(raw);
  }

  async findByEmail(email: string): Promise<UserEntityProps | null> {
    const raw = await this.prisma.user.findUnique({
      where: { email },
      include: {
        studentProfile: true,
        staffAccount: true,
        ownedStalls: { select: { id: true } },
      },
    });
    if (!raw) return null;

    return this.mapToDomain(raw);
  }

  async findByPhoneNumber(phoneNumber: string): Promise<UserEntityProps | null> {
    const raw = await this.prisma.user.findUnique({
      where: { phoneNumber },
      include: {
        studentProfile: true,
        staffAccount: true,
        ownedStalls: { select: { id: true } },
      },
    });
    if (!raw) return null;

    return this.mapToDomain(raw);
  }

  async save(user: UserEntityProps): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        passwordHash: user.passwordHash,
        role: user.role,
        isActive: user.isActive,
      },
      update: {
        email: user.email,
        phoneNumber: user.phoneNumber,
        passwordHash: user.passwordHash,
        role: user.role,
        isActive: user.isActive,
      },
    });
  }

  private mapToDomain(raw: any): UserEntityProps {
    return {
      id: raw.id,
      email: raw.email,
      phoneNumber: raw.phoneNumber,
      passwordHash: raw.passwordHash,
      role: raw.role as UserRole,
      isActive: raw.isActive,
      studentProfile: raw.studentProfile ? {
        id: raw.studentProfile.id,
        fullName: raw.studentProfile.fullName,
        universityRegNumber: raw.studentProfile.universityRegNumber,
        accountStatus: raw.studentProfile.accountStatus as StudentAccountStatus,
      } : null,
      staffAccount: raw.staffAccount ? {
        id: raw.staffAccount.id,
        stallId: raw.staffAccount.stallId,
      } : null,
      ownedStalls: raw.ownedStalls || [],
    };
  }
}
