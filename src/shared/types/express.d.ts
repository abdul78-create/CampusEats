import { UserRole } from '../../modules/identity/domain/IdentityEnums.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
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
    permissions?: string[];
  } | null;
  ownedStalls?: { id: string }[];
}

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: AuthenticatedUser;
    }
  }
}
