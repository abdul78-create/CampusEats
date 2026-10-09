import { 
  VerificationStatus, 
  StudentAccountStatus, 
  VerificationRejectionReason 
} from './IdentityEnums.js';

export interface VerificationRecord {
  id: string;
  studentProfileId: string;
  status: VerificationStatus;
  rejectionReasonCode?: VerificationRejectionReason | null;
  rejectionReason?: string | null;
  reviewedByAdminId?: string | null;
  reviewedAt?: Date | null;
  submittedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  studentProfile: {
    id: string;
    userId: string;
    fullName: string;
    universityRegNumber: string;
    accountStatus: StudentAccountStatus;
    user: {
      id: string;
      email: string;
      phoneNumber: string;
      isActive: boolean;
    };
  };
  identityDocument?: {
    id: string;
    verificationId: string;
    documentType: string;
    originalFilename?: string | null;
    fileStoragePath: string;
    fileMimeType: string;
    fileSizeBytes: number;
    fileSha256Checksum: string;
    createdAt: Date;
  } | null;
  livenessVerification?: {
    id: string;
    verificationId: string;
    providerName: string;
    isLiveHuman: boolean;
    naturalBlinkPassed: boolean;
    headTurnLeftPassed: boolean;
    headTurnRightPassed: boolean;
    confidenceScore?: number | null;
    verifiedAt?: Date | null;
  } | null;
}

export interface DocumentSubmissionData {
  verificationId: string;
  studentProfileId: string;
  documentType: string;
  originalFilename: string;
  fileStoragePath: string;
  fileMimeType: string;
  fileSizeBytes: number;
  fileSha256Checksum: string;
}

export interface ListVerificationsParams {
  status?: VerificationStatus;
  skip?: number;
  take?: number;
}

export interface IStudentVerificationRepository {
  findProfileByUserId(userId: string): Promise<{
    id: string;
    userId: string;
    fullName: string;
    universityRegNumber: string;
    accountStatus: StudentAccountStatus;
    user: {
      id: string;
      email: string;
      phoneNumber: string;
      isActive: boolean;
    };
  } | null>;

  findProfileById(profileId: string): Promise<{
    id: string;
    userId: string;
    fullName: string;
    universityRegNumber: string;
    accountStatus: StudentAccountStatus;
  } | null>;

  findLatestVerificationByProfileId(profileId: string): Promise<VerificationRecord | null>;

  findVerificationById(verificationId: string): Promise<VerificationRecord | null>;

  submitIdentityDocument(data: DocumentSubmissionData): Promise<VerificationRecord>;

  approveVerification(params: {
    verificationId: string;
    adminId: string;
    reviewedAt: Date;
  }): Promise<VerificationRecord>;

  rejectVerification(params: {
    verificationId: string;
    adminId: string;
    reasonCode: VerificationRejectionReason;
    notes?: string;
    reviewedAt: Date;
  }): Promise<VerificationRecord>;

  suspendStudent(params: {
    profileId: string;
    verificationId?: string;
  }): Promise<void>;

  reactivateStudent(params: {
    profileId: string;
    verificationId?: string;
  }): Promise<void>;

  listVerifications(params: ListVerificationsParams): Promise<{
    records: VerificationRecord[];
    total: number;
  }>;
}
