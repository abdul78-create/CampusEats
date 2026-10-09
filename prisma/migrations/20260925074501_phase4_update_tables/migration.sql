-- AlterTable
ALTER TABLE "IdentityDocument" ADD COLUMN "originalFilename" TEXT;

-- AlterTable
ALTER TABLE "StudentVerification" ADD COLUMN "rejectionReasonCode" "VerificationRejectionReason",
ADD COLUMN "submittedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'PENDING_SUBMISSION';
