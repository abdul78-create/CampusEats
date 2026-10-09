-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'STALL_OWNER', 'ADMIN', 'STALL_STAFF');

-- CreateEnum
CREATE TYPE "StudentAccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LivenessChallengeType" AS ENUM ('NATURAL_BLINK', 'HEAD_TURN_LEFT', 'HEAD_TURN_RIGHT');

-- CreateEnum
CREATE TYPE "StallStatus" AS ENUM ('CLOSED', 'OPEN', 'BUSY', 'TEMPORARILY_PAUSED');

-- CreateEnum
CREATE TYPE "OrderProcessingMode" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "StaffPermissionType" AS ENUM ('MANAGE_ORDERS', 'MANAGE_MENU', 'VIEW_PAYMENTS', 'VIEW_ANALYTICS', 'MANAGE_INVENTORY');

-- CreateEnum
CREATE TYPE "ItemAvailabilityState" AS ENUM ('AVAILABLE', 'SOLD_OUT');

-- CreateEnum
CREATE TYPE "MasterOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'PARTIALLY_FULFILLED', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'CONFIRMED', 'PREPARING', 'READY', 'COLLECTED', 'PAYMENT_FAILED', 'REJECTED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'EXPIRED', 'MISSED_PICKUP');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING_VERIFICATION', 'SUCCESS', 'FAILED', 'PARTIALLY_PAID');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ADVANCE', 'REMAINING_BALANCE', 'REFUND');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REFUND_PENDING', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_STATUS', 'SCHEDULE_SHIFTED', 'PAYMENT_CONFIRMATION', 'REFUND_PROCESSED', 'VERIFICATION_UPDATE', 'SYSTEM_ALERT');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('USER_VERIFIED', 'USER_SUSPENDED', 'USER_REJECTED', 'STALL_CREATED', 'STALL_STATUS_OVERRIDE', 'STALL_CAPACITY_OVERRIDE', 'ORDER_MANUAL_ACCEPT', 'ORDER_MANUAL_REJECT', 'ADMIN_CANCEL_ORDER', 'ADMIN_REFUND_PROCESSED', 'SECURITY_POLICY_UPDATE', 'SENSITIVE_DATA_ACCESS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "universityRegNumber" TEXT NOT NULL,
    "profilePhotoUrl" TEXT,
    "accountStatus" "StudentAccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentVerification" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityDocument" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'UNIVERSITY_ID_CARD',
    "fileStoragePath" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "fileSha256Checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivenessVerification" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL DEFAULT 'mock',
    "providerSessionId" TEXT,
    "naturalBlinkPassed" BOOLEAN NOT NULL DEFAULT false,
    "headTurnLeftPassed" BOOLEAN NOT NULL DEFAULT false,
    "headTurnRightPassed" BOOLEAN NOT NULL DEFAULT false,
    "confidenceScore" DOUBLE PRECISION,
    "verifiedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivenessVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stall" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campusBlock" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "liveStatus" "StallStatus" NOT NULL DEFAULT 'CLOSED',
    "processingMode" "OrderProcessingMode" NOT NULL DEFAULT 'MANUAL',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Stall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StallOperatingHour" (
    "id" TEXT NOT NULL,
    "stallId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StallOperatingHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StallCapacity" (
    "id" TEXT NOT NULL,
    "stallId" TEXT NOT NULL,
    "maxActiveOrders" INTEGER NOT NULL DEFAULT 20,
    "maxOrdersPerWindow" INTEGER NOT NULL DEFAULT 15,
    "windowDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxOrdersPerPickupInterval" INTEGER NOT NULL DEFAULT 5,
    "pickupIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "parallelPreparationLimit" INTEGER NOT NULL DEFAULT 4,
    "operationalBufferMinutes" INTEGER NOT NULL DEFAULT 2,
    "pickupGracePeriodMinutes" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StallCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stallId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPermission" (
    "id" TEXT NOT NULL,
    "staffAccountId" TEXT NOT NULL,
    "permission" "StaffPermissionType" NOT NULL,

    CONSTRAINT "StaffPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "stallId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "category" TEXT NOT NULL,
    "isVegetarian" BOOLEAN NOT NULL DEFAULT true,
    "ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preparationTimeMinutes" INTEGER NOT NULL DEFAULT 10,
    "availabilityState" "ItemAvailabilityState" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemInventory" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "availableQuantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItemInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterOrder" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "MasterOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "advancePercentage" INTEGER NOT NULL,
    "advanceAmount" DECIMAL(10,2) NOT NULL,
    "remainingAmount" DECIMAL(10,2) NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubOrder" (
    "id" TEXT NOT NULL,
    "masterOrderId" TEXT NOT NULL,
    "stallId" TEXT NOT NULL,
    "subOrderNumber" TEXT NOT NULL,
    "status" "SubOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotalAmount" DECIMAL(10,2) NOT NULL,
    "advancePaidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "balanceDueAmount" DECIMAL(10,2) NOT NULL,
    "isBalancePaid" BOOLEAN NOT NULL DEFAULT false,
    "pickupGraceExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "subOrderId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "snapshotItemName" TEXT NOT NULL,
    "snapshotPrice" DECIMAL(10,2) NOT NULL,
    "snapshotPrepMinutes" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupSchedule" (
    "id" TEXT NOT NULL,
    "subOrderId" TEXT NOT NULL,
    "requestedPickupTime" TIMESTAMP(3) NOT NULL,
    "scheduledPickupTime" TIMESTAMP(3) NOT NULL,
    "earliestFeasiblePickupTime" TIMESTAMP(3) NOT NULL,
    "preparationTimeMinutes" INTEGER NOT NULL,
    "queueDelayMinutes" INTEGER NOT NULL,
    "operationalBufferMinutes" INTEGER NOT NULL,
    "capacityConstraintApplied" BOOLEAN NOT NULL DEFAULT false,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "rescheduleReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "masterOrderId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "advancePercentage" INTEGER NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "advanceAmount" DECIMAL(10,2) NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "amountRemaining" DECIMAL(10,2) NOT NULL,
    "upiVpa" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "providerTransactionId" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'UPI',
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "gatewayResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "subOrderId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amountPaidForSuborder" DECIMAL(10,2) NOT NULL,
    "refundAmount" DECIMAL(10,2) NOT NULL,
    "refundReason" TEXT NOT NULL,
    "refundReference" TEXT,
    "refundStatus" "RefundStatus" NOT NULL DEFAULT 'REFUND_PENDING',
    "providerRefundId" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "sequenceNumber" BIGSERIAL NOT NULL,
    "actorId" TEXT,
    "actionType" "AuditActionType" NOT NULL,
    "targetEntity" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "sessionReference" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousHash" TEXT NOT NULL,
    "currentHash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "targetAction" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responsePayload" JSONB,
    "statusCode" INTEGER,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_phoneNumber_idx" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_universityRegNumber_key" ON "StudentProfile"("universityRegNumber");

-- CreateIndex
CREATE INDEX "StudentProfile_universityRegNumber_idx" ON "StudentProfile"("universityRegNumber");

-- CreateIndex
CREATE INDEX "StudentProfile_accountStatus_idx" ON "StudentProfile"("accountStatus");

-- CreateIndex
CREATE INDEX "StudentVerification_studentProfileId_idx" ON "StudentVerification"("studentProfileId");

-- CreateIndex
CREATE INDEX "StudentVerification_status_idx" ON "StudentVerification"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityDocument_verificationId_key" ON "IdentityDocument"("verificationId");

-- CreateIndex
CREATE UNIQUE INDEX "LivenessVerification_verificationId_key" ON "LivenessVerification"("verificationId");

-- CreateIndex
CREATE INDEX "Stall_campusBlock_idx" ON "Stall"("campusBlock");

-- CreateIndex
CREATE INDEX "Stall_liveStatus_idx" ON "Stall"("liveStatus");

-- CreateIndex
CREATE INDEX "Stall_isApproved_idx" ON "Stall"("isApproved");

-- CreateIndex
CREATE UNIQUE INDEX "StallOperatingHour_stallId_dayOfWeek_key" ON "StallOperatingHour"("stallId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "StallCapacity_stallId_key" ON "StallCapacity"("stallId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccount_userId_key" ON "StaffAccount"("userId");

-- CreateIndex
CREATE INDEX "StaffAccount_stallId_idx" ON "StaffAccount"("stallId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPermission_staffAccountId_permission_key" ON "StaffPermission"("staffAccountId", "permission");

-- CreateIndex
CREATE INDEX "MenuItem_stallId_idx" ON "MenuItem"("stallId");

-- CreateIndex
CREATE INDEX "MenuItem_category_idx" ON "MenuItem"("category");

-- CreateIndex
CREATE INDEX "MenuItem_availabilityState_idx" ON "MenuItem"("availabilityState");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemInventory_menuItemId_key" ON "MenuItemInventory"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterOrder_orderNumber_key" ON "MasterOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "MasterOrder_studentId_idx" ON "MasterOrder"("studentId");

-- CreateIndex
CREATE INDEX "MasterOrder_status_idx" ON "MasterOrder"("status");

-- CreateIndex
CREATE INDEX "MasterOrder_orderNumber_idx" ON "MasterOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SubOrder_subOrderNumber_key" ON "SubOrder"("subOrderNumber");

-- CreateIndex
CREATE INDEX "SubOrder_masterOrderId_idx" ON "SubOrder"("masterOrderId");

-- CreateIndex
CREATE INDEX "SubOrder_stallId_idx" ON "SubOrder"("stallId");

-- CreateIndex
CREATE INDEX "SubOrder_status_idx" ON "SubOrder"("status");

-- CreateIndex
CREATE INDEX "SubOrder_subOrderNumber_idx" ON "SubOrder"("subOrderNumber");

-- CreateIndex
CREATE INDEX "OrderItem_subOrderId_idx" ON "OrderItem"("subOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PickupSchedule_subOrderId_key" ON "PickupSchedule"("subOrderId");

-- CreateIndex
CREATE INDEX "PickupSchedule_scheduledPickupTime_idx" ON "PickupSchedule"("scheduledPickupTime");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_masterOrderId_idx" ON "Payment"("masterOrderId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_idempotencyKey_idx" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentTransaction_paymentId_idx" ON "PaymentTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_idx" ON "PaymentTransaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_subOrderId_key" ON "Refund"("subOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_refundStatus_idx" ON "Refund"("refundStatus");

-- CreateIndex
CREATE INDEX "Refund_idempotencyKey_idx" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_sequenceNumber_key" ON "AuditLog"("sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_currentHash_key" ON "AuditLog"("currentHash");

-- CreateIndex
CREATE INDEX "AuditLog_targetEntity_targetId_idx" ON "AuditLog"("targetEntity", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_sequenceNumber_idx" ON "AuditLog"("sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_key_idx" ON "IdempotencyRecord"("key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentVerification" ADD CONSTRAINT "StudentVerification_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityDocument" ADD CONSTRAINT "IdentityDocument_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "StudentVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivenessVerification" ADD CONSTRAINT "LivenessVerification_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "StudentVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stall" ADD CONSTRAINT "Stall_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StallOperatingHour" ADD CONSTRAINT "StallOperatingHour_stallId_fkey" FOREIGN KEY ("stallId") REFERENCES "Stall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StallCapacity" ADD CONSTRAINT "StallCapacity_stallId_fkey" FOREIGN KEY ("stallId") REFERENCES "Stall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccount" ADD CONSTRAINT "StaffAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAccount" ADD CONSTRAINT "StaffAccount_stallId_fkey" FOREIGN KEY ("stallId") REFERENCES "Stall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermission" ADD CONSTRAINT "StaffPermission_staffAccountId_fkey" FOREIGN KEY ("staffAccountId") REFERENCES "StaffAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_stallId_fkey" FOREIGN KEY ("stallId") REFERENCES "Stall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemInventory" ADD CONSTRAINT "MenuItemInventory_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterOrder" ADD CONSTRAINT "MasterOrder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubOrder" ADD CONSTRAINT "SubOrder_masterOrderId_fkey" FOREIGN KEY ("masterOrderId") REFERENCES "MasterOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubOrder" ADD CONSTRAINT "SubOrder_stallId_fkey" FOREIGN KEY ("stallId") REFERENCES "Stall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_subOrderId_fkey" FOREIGN KEY ("subOrderId") REFERENCES "SubOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSchedule" ADD CONSTRAINT "PickupSchedule_subOrderId_fkey" FOREIGN KEY ("subOrderId") REFERENCES "SubOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_masterOrderId_fkey" FOREIGN KEY ("masterOrderId") REFERENCES "MasterOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_subOrderId_fkey" FOREIGN KEY ("subOrderId") REFERENCES "SubOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
