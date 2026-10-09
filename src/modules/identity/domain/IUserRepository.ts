import { UserRole, StudentAccountStatus } from './IdentityEnums.js';

export interface UserEntityProps {
  id: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  studentProfile?: {
    id: string;
    fullName: string;
    universityRegNumber: string;
    accountStatus: StudentAccountStatus;
  } | null;
  staffAccount?: {
    id: string;
    stallId: string;
  } | null;
  ownedStalls?: { id: string }[];
}

export interface IUserRepository {
  findById(id: string): Promise<UserEntityProps | null>;
  findByEmail(email: string): Promise<UserEntityProps | null>;
  findByPhoneNumber(phoneNumber: string): Promise<UserEntityProps | null>;
  save(user: UserEntityProps): Promise<void>;
}
