-- Migration to normalize VerificationStatus enum: remove APPROVED and PENDING, keeping only authoritative Phase 4 states.

-- Step 1: Create the normalized enum type
CREATE TYPE "VerificationStatus_new" AS ENUM (
  'PENDING_SUBMISSION',
  'UNDER_REVIEW',
  'ACTIVE',
  'REJECTED',
  'SUSPENDED'
);

-- Step 2: Drop the existing column default
ALTER TABLE "StudentVerification" ALTER COLUMN "status" DROP DEFAULT;

-- Step 3: Normalize any existing rows
UPDATE "StudentVerification" 
SET "status" = 'ACTIVE'::text::"VerificationStatus" 
WHERE "status"::text = 'APPROVED';

UPDATE "StudentVerification" 
SET "status" = 'PENDING_SUBMISSION'::text::"VerificationStatus" 
WHERE "status"::text = 'PENDING';

-- Step 4: Cast column to the new enum type
ALTER TABLE "StudentVerification" 
ALTER COLUMN "status" TYPE "VerificationStatus_new" 
USING ("status"::text::"VerificationStatus_new");

-- Step 5: Drop the old enum and rename the new one
DROP TYPE "VerificationStatus";
ALTER TYPE "VerificationStatus_new" RENAME TO "VerificationStatus";

-- Step 6: Restore default value to PENDING_SUBMISSION
ALTER TABLE "StudentVerification" 
ALTER COLUMN "status" SET DEFAULT 'PENDING_SUBMISSION'::"VerificationStatus";
