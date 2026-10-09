import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { PrismaOrderRepository } from '../../src/modules/ordering/infrastructure/PrismaOrderRepository.js';
import { PrismaStallRepository } from '../../src/modules/stall/infrastructure/PrismaStallRepository.js';
import { PrismaInventoryRepository } from '../../src/modules/stall/infrastructure/PrismaInventoryRepository.js';
import { PrismaAuditLogRepository } from '../../src/modules/audit/infrastructure/PrismaAuditLogRepository.js';
import { MasterOrderAggregate } from '../../src/modules/ordering/domain/MasterOrderAggregate.js';
import { SubOrderAggregate } from '../../src/modules/ordering/domain/SubOrderAggregate.js';
import { OrderItemSnapshot } from '../../src/modules/ordering/domain/OrderItemSnapshot.js';
import { StallAggregate } from '../../src/modules/stall/domain/StallAggregate.js';
import { StallStatus, OrderProcessingMode, ItemAvailabilityState } from '../../src/modules/stall/domain/StallEnums.js';
import { UserRole } from '../../src/modules/identity/domain/IdentityEnums.js';
import { AuditActionType } from '../../src/modules/audit/domain/AuditEnums.js';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

describe('PostgreSQL Prisma Persistence & Schema Integrity', () => {
  const prisma = PrismaService.getClient();
  const orderRepo = new PrismaOrderRepository(prisma);
  const stallRepo = new PrismaStallRepository(prisma);
  const inventoryRepo = new PrismaInventoryRepository(prisma);
  const auditRepo = new PrismaAuditLogRepository(prisma);

  const testSuffix = Date.now().toString(36);
  const testUserId = `usr_test_${testSuffix}`;
  const testStallId = `stl_test_${testSuffix}`;
  const testMenuItemId = `itm_test_${testSuffix}`;

  beforeAll(async () => {
    // 0. Ensure fresh audit chain for persistence integrity test
    await prisma.auditLog.deleteMany({});

    // 1. Create a persistent test user
    await prisma.user.create({
      data: {
        id: testUserId,
        email: `tester_${testSuffix}@campus.edu`,
        phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        passwordHash: '$2b$12$secureHashMockForDatabaseTestOnly',
        role: UserRole.STALL_OWNER,
      },
    });

    // 2. Create a persistent test stall with capacity and operating hours
    const stall = new StallAggregate({
      id: testStallId,
      ownerId: testUserId,
      name: `Test Stall ${testSuffix}`,
      campusBlock: 'Block C',
      liveStatus: StallStatus.OPEN,
      processingMode: OrderProcessingMode.AUTOMATIC,
      isApproved: true,
      capacity: {
        id: `cap_${testStallId}`,
        stallId: testStallId,
        maxActiveOrders: 15,
        maxOrdersPerWindow: 10,
        windowDurationMinutes: 30,
        maxOrdersPerPickupInterval: 5,
        pickupIntervalMinutes: 10,
        parallelPreparationLimit: 3,
        operationalBufferMinutes: 2,
        pickupGracePeriodMinutes: 15,
      },
      operatingHours: [
        { id: `h_${testStallId}_1`, stallId: testStallId, dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
      ],
    });
    await stallRepo.save(stall);

    // 3. Create a persistent menu item & inventory
    await prisma.menuItem.create({
      data: {
        id: testMenuItemId,
        stallId: testStallId,
        name: 'Paneer Roll',
        price: 80.00,
        category: 'Wraps',
        isVegetarian: true,
        ingredients: ['Paneer', 'Wheat wrap'],
        allergens: ['Dairy', 'Gluten'],
        preparationTimeMinutes: 7,
        availabilityState: ItemAvailabilityState.AVAILABLE,
        inventory: {
          create: {
            availableQuantity: 20,
            reservedQuantity: 0,
          },
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up test records
    try {
      await prisma.orderItem.deleteMany({ where: { snapshotItemName: 'Paneer Roll' } });
      await prisma.subOrder.deleteMany({ where: { stallId: testStallId } });
      await prisma.masterOrder.deleteMany({ where: { studentId: testUserId } });
      await prisma.menuItemInventory.deleteMany({ where: { menuItemId: testMenuItemId } });
      await prisma.menuItem.deleteMany({ where: { id: testMenuItemId } });
      await prisma.stallCapacity.deleteMany({ where: { stallId: testStallId } });
      await prisma.stallOperatingHour.deleteMany({ where: { stallId: testStallId } });
      await prisma.stall.deleteMany({ where: { id: testStallId } });
      await prisma.auditLog.deleteMany({ where: { actorId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    } catch {
      // Ignore cleanup error
    }
    await PrismaService.disconnect();
  });

  test('persists and retrieves StallAggregate with Capacity and Operating Hours', async () => {
    const loaded = await stallRepo.findById(testStallId);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe(`Test Stall ${testSuffix}`);
    expect(loaded!.capacity.maxActiveOrders).toBe(15);
    expect(loaded!.capacity.parallelPreparationLimit).toBe(3);
    expect(loaded!.operatingHours).toHaveLength(1);
    expect(loaded!.operatingHours[0].openTime).toBe('09:00');
  });

  test('persists MasterOrder, SubOrder, and immutable OrderItem snapshots in PostgreSQL', async () => {
    const masterOrderId = `mo_${testSuffix}`;
    const subOrderId = `so_${testSuffix}`;

    const itemSnapshot = new OrderItemSnapshot({
      id: `snap_${testSuffix}`,
      subOrderId,
      menuItemId: testMenuItemId,
      snapshotItemName: 'Paneer Roll',
      snapshotPrice: 80.00,
      snapshotPrepMinutes: 7,
      quantity: 2,
      totalPrice: 160.00,
    });

    const subOrder = new SubOrderAggregate({
      id: subOrderId,
      masterOrderId,
      stallId: testStallId,
      subOrderNumber: `CE-TEST-${testSuffix}-S1`,
      items: [itemSnapshot],
    });

    const masterOrder = new MasterOrderAggregate({
      id: masterOrderId,
      studentId: testUserId,
      orderNumber: `CE-TEST-${testSuffix}`,
      advancePercentage: 50,
      subOrders: [subOrder],
    });

    // Save to PostgreSQL via Prisma
    await orderRepo.saveMasterOrder(masterOrder);

    // Retrieve and verify
    const retrieved = await orderRepo.findMasterOrderById(masterOrderId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.totalAmount).toBe(160.00);
    expect(retrieved!.advanceAmount).toBe(80.00);
    expect(retrieved!.remainingAmount).toBe(80.00);
    expect(retrieved!.subOrders).toHaveLength(1);

    const sub = retrieved!.subOrders[0];
    expect(sub.items).toHaveLength(1);
    expect(sub.items[0].snapshotItemName).toBe('Paneer Roll');
    expect(sub.items[0].snapshotPrice).toBe(80.00);
    expect(sub.items[0].quantity).toBe(2);
    expect(sub.items[0].totalPrice).toBe(160.00);
  });

  test('persists audit log with sequential SHA-256 hash chaining and verifies database chain integrity', async () => {
    // 1. Append 2 chained audit entries in PostgreSQL
    const entry1 = await auditRepo.append({
      actorId: testUserId,
      actionType: AuditActionType.STALL_CREATED,
      targetEntity: 'Stall',
      targetId: testStallId,
      previousValue: null,
      newValue: { name: `Test Stall ${testSuffix}` },
      reason: 'Automated persistent test initialization',
      timestamp: new Date(),
    });

    const entry2 = await auditRepo.append({
      actorId: testUserId,
      actionType: AuditActionType.STALL_STATUS_OVERRIDE,
      targetEntity: 'Stall',
      targetId: testStallId,
      previousValue: { liveStatus: 'CLOSED' },
      newValue: { liveStatus: 'OPEN' },
      reason: 'Vendor shift started',
      timestamp: new Date(),
    });

    // 2. Verify sequence number monotonically increases and previousHash matches previous currentHash
    expect(entry2.sequenceNumber).toBe(entry1.sequenceNumber + 1n);
    expect(entry2.previousHash).toBe(entry1.currentHash);
    expect(entry1.currentHash).toHaveLength(64);
    expect(entry2.currentHash).toHaveLength(64);

    // 3. Run cryptographic chain integrity validation across the database table
    const verification = await auditRepo.verifyChain();
    expect(verification.isValid).toBe(true);
    expect(verification.totalRecordsChecked).toBeGreaterThanOrEqual(2);
  });

  test('detects unauthorized PostgreSQL database row tampering via audit chain verification', async () => {
    // Append a distinct audit entry
    const entry = await auditRepo.append({
      actorId: testUserId,
      actionType: AuditActionType.ADMIN_REFUND_PROCESSED,
      targetEntity: 'Refund',
      targetId: `ref_${testSuffix}`,
      previousValue: null,
      newValue: { refundAmount: 50.00 },
      reason: 'Operational failure reimbursement',
      timestamp: new Date(),
    });

    // Simulate direct, unauthorized database tampering on the persisted row
    await prisma.auditLog.update({
      where: { id: entry.id },
      data: {
        newValue: { refundAmount: 5000.00 }, // TAMPERED in PostgreSQL
      },
    });

    // Application integrity check detects the payload modification
    const tamperReport = await auditRepo.verifyChain();
    expect(tamperReport.isValid).toBe(false);
    expect(tamperReport.brokenSequenceNumber).toBe(entry.sequenceNumber);
    expect(tamperReport.errorDetails).toContain('Tampered payload detected');
    await prisma.auditLog.delete({ where: { id: entry.id } });
  });
});
