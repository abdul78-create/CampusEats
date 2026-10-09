-- Phase 5 Migration: UPI Advance Payments, Webhook Settlement & Fault-Isolated Refunds

-- Step 1: Update TransactionType enum (Remove REFUND, keep strictly ADVANCE and REMAINING_BALANCE)
CREATE TYPE "TransactionType_new" AS ENUM ('ADVANCE', 'REMAINING_BALANCE');
ALTER TABLE "PaymentTransaction" ALTER COLUMN "transactionType" TYPE "TransactionType_new" USING ("transactionType"::text::"TransactionType_new");
DROP TYPE "TransactionType";
ALTER TYPE "TransactionType_new" RENAME TO "TransactionType";

-- Step 2: Update PaymentStatus enum (Add EXPIRED)
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- Step 3: Update RefundStatus enum (Add PROCESSING)
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

-- Step 4: Update AuditActionType enum with Phase 5 actions
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'PAYMENT_INITIATED';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'PAYMENT_COMPLETED';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'PAYMENT_EXPIRED';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'BALANCE_SETTLED_ONLINE';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'REFUND_INITIATED';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'REFUND_COMPLETED';
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'REFUND_FAILED';

-- Step 5: Update PaymentTransaction table with expiresAt and unique providerTransactionId
ALTER TABLE "PaymentTransaction" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- Step 6: Create unique index on PaymentTransaction(providerTransactionId)
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentTransaction_providerTransactionId_key" ON "PaymentTransaction"("providerTransactionId");
