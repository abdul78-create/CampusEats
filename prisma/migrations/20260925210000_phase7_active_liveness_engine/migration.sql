-- CreateEnum
CREATE TYPE "LivenessSessionStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LivenessDecision" AS ENUM ('LIVE', 'SPOOF', 'INCONCLUSIVE');

-- AlterTable
ALTER TABLE "LivenessVerification" ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "evidenceStoragePath" TEXT,
ADD COLUMN "isLiveHuman" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastFailureAt" TIMESTAMP(3),
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "providerName" DROP DEFAULT;

-- CreateTable
CREATE TABLE "LivenessSession" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "sessionNonce" TEXT NOT NULL,
    "challengeSequence" "LivenessChallengeType"[],
    "challengeParams" JSONB NOT NULL,
    "status" "LivenessSessionStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "evidenceStoragePath" TEXT,
    "evidenceSha256" TEXT,
    "providerReference" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "decision" "LivenessDecision",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivenessSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivenessEvidenceDigest" (
    "id" TEXT NOT NULL,
    "sha256Digest" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivenessEvidenceDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LivenessSession_sessionNonce_key" ON "LivenessSession"("sessionNonce");

-- CreateIndex
CREATE INDEX "LivenessSession_verificationId_idx" ON "LivenessSession"("verificationId");

-- CreateIndex
CREATE INDEX "LivenessSession_status_expiresAt_idx" ON "LivenessSession"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "LivenessEvidenceDigest_sha256Digest_key" ON "LivenessEvidenceDigest"("sha256Digest");

-- CreateIndex
CREATE INDEX "LivenessEvidenceDigest_sha256Digest_idx" ON "LivenessEvidenceDigest"("sha256Digest");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LivenessVerification_verificationId_idx" ON "LivenessVerification"("verificationId");

-- AddForeignKey
ALTER TABLE "LivenessSession" ADD CONSTRAINT "LivenessSession_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "StudentVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
