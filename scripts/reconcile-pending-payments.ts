/**
 * CampusEats — Production Payment Reconciliation Utility
 *
 * Operational utility to sweep and reconcile payment transactions:
 * 1. Identifies stale INITIATED attempts past their 15-minute validity window.
 * 2. Marks them as EXPIRED and logs immutable cryptographic audit entries.
 * 3. Reports summary metrics for operations & accounting.
 *
 * Usage:
 *   npx tsx scripts/reconcile-pending-payments.ts [--dry-run]
 */

import { PrismaService } from '../src/shared/infrastructure/PrismaService.js';
import { PrismaAuditLogRepository } from '../src/modules/audit/infrastructure/PrismaAuditLogRepository.js';
import { AuditActionType } from '../src/modules/audit/domain/AuditInterfaces.js';
import { PaymentStatus } from '../src/modules/payment/domain/PaymentEnums.js';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const prisma = PrismaService.getClient();
  const auditRepo = new PrismaAuditLogRepository(prisma);

  console.log(`[Reconciliation] Starting payment sweep (Dry run: ${isDryRun})...`);

  const now = new Date();

  // Find all INITIATED transactions where TTL has expired
  const staleTransactions = await prisma.paymentTransaction.findMany({
    where: {
      status: PaymentStatus.INITIATED,
      expiresAt: {
        lt: now,
      },
    },
    include: {
      payment: {
        include: {
          masterOrder: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  console.log(`[Reconciliation] Found ${staleTransactions.length} stale transaction(s) past validity TTL.`);

  let expiredCount = 0;

  for (const txn of staleTransactions) {
    console.log(
      `  - Stale Txn: ID=${txn.id}, ProviderRef=${txn.providerTransactionId}, Amount=₹${txn.amount}, Order=${txn.payment.masterOrder.orderNumber}, ExpiredAt=${txn.expiresAt?.toISOString()}`
    );

    if (!isDryRun) {
      await prisma.paymentTransaction.update({
        where: { id: txn.id },
        data: { status: PaymentStatus.EXPIRED },
      });

      await auditRepo.append({
        actorId: txn.payment.masterOrder.studentId,
        actionType: AuditActionType.PAYMENT_EXPIRED,
        targetEntity: 'PaymentTransaction',
        targetId: txn.id,
        reason: 'Reconciliation sweep: 15-minute TTL elapsed without gateway webhook confirmation',
      });

      expiredCount++;
    }
  }

  if (isDryRun) {
    console.log(`[Reconciliation] DRY RUN complete. ${staleTransactions.length} transaction(s) would be marked EXPIRED.`);
  } else {
    console.log(`[Reconciliation] Completed successfully. ${expiredCount} transaction(s) transitioned to EXPIRED.`);
  }

  await PrismaService.disconnect();
}

main().catch(async (error) => {
  console.error('[Reconciliation] Fatal error during sweep:', error);
  await PrismaService.disconnect();
  process.exit(1);
});
