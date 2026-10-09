import { CheckoutService } from '../../src/modules/ordering/application/CheckoutService.js';
import { IOrderRepository } from '../../src/modules/ordering/domain/IOrderRepository.js';
import { IStallRepository } from '../../src/modules/stall/domain/IStallRepository.js';
import { IInventoryRepository } from '../../src/modules/stall/domain/IInventoryRepository.js';
import { IIdempotencyRepository, IdempotencyRecordProps } from '../../src/shared/infrastructure/IIdempotencyRepository.js';
import { StallAggregate } from '../../src/modules/stall/domain/StallAggregate.js';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';
import { MasterOrderAggregate } from '../../src/modules/ordering/domain/MasterOrderAggregate.js';
import { SubOrderAggregate } from '../../src/modules/ordering/domain/SubOrderAggregate.js';
import { StudentAccountStatus } from '../../src/modules/identity/domain/IdentityEnums.js';
import { ConflictError, UnverifiedStudentError } from '../../src/shared/errors/DomainErrors.js';

class MockOrderRepo implements IOrderRepository {
  public orders: Map<string, MasterOrderAggregate> = new Map();
  public subOrders: Map<string, SubOrderAggregate> = new Map();

  async saveMasterOrder(order: MasterOrderAggregate): Promise<void> {
    this.orders.set(order.id, order);
    for (const sub of order.subOrders) {
      this.subOrders.set(sub.id, sub);
    }
  }
  async findMasterOrderById(id: string): Promise<MasterOrderAggregate | null> {
    return this.orders.get(id) || null;
  }
  async findMasterOrderByOrderNumber(orderNumber: string): Promise<MasterOrderAggregate | null> {
    for (const o of this.orders.values()) {
      if (o.orderNumber === orderNumber) return o;
    }
    return null;
  }
  async findMasterOrdersByStudentId(studentId: string): Promise<MasterOrderAggregate[]> {
    return Array.from(this.orders.values()).filter(o => o.studentId === studentId);
  }
  async findSubOrderById(subOrderId: string): Promise<SubOrderAggregate | null> {
    return this.subOrders.get(subOrderId) || null;
  }
  async findSubOrdersByStallId(stallId: string): Promise<SubOrderAggregate[]> {
    return Array.from(this.subOrders.values()).filter(s => s.stallId === stallId);
  }
  async saveSubOrder(subOrder: SubOrderAggregate): Promise<void> {
    this.subOrders.set(subOrder.id, subOrder);
  }
  async countActiveSubOrdersForStall(stallId: string): Promise<number> {
    return Array.from(this.subOrders.values()).filter(s => s.stallId === stallId).length;
  }
  async createNotification(_props: any): Promise<void> {}
}

class MockStallRepo implements IStallRepository {
  public stalls: Map<string, StallAggregate> = new Map();

  async save(stall: StallAggregate): Promise<void> {
    this.stalls.set(stall.id, stall);
  }
  async findById(id: string): Promise<StallAggregate | null> {
    return this.stalls.get(id) || null;
  }
  async findByOwnerId(ownerId: string): Promise<StallAggregate[]> {
    return Array.from(this.stalls.values()).filter(s => s.ownerId === ownerId);
  }
  async findAllApproved(): Promise<StallAggregate[]> {
    return Array.from(this.stalls.values()).filter(s => s.isApproved);
  }
}

class MockInventoryRepo implements IInventoryRepository {
  public stock: Map<string, { available: number; reserved: number }> = new Map();

  async findByMenuItemId(menuItemId: string): Promise<any> {
    const s = this.stock.get(menuItemId);
    if (!s) return null;
    return { availableQuantity: s.available, reservedQuantity: s.reserved };
  }
  async save(record: any): Promise<void> {
    this.stock.set(record.menuItemId, { available: record.availableQuantity, reserved: record.reservedQuantity });
  }
  async reserveStockAtomic(menuItemId: string, quantity: number): Promise<void> {
    const s = this.stock.get(menuItemId);
    if (!s || s.available < quantity) {
      throw new ConflictError(`Insufficient inventory for item ${menuItemId}`);
    }
    s.available -= quantity;
    s.reserved += quantity;
  }
  async releaseStockAtomic(menuItemId: string, quantity: number): Promise<void> {
    const s = this.stock.get(menuItemId);
    if (s) {
      s.available += quantity;
      s.reserved = Math.max(0, s.reserved - quantity);
    }
  }
  async commitStockAtomic(menuItemId: string, quantity: number): Promise<void> {
    const s = this.stock.get(menuItemId);
    if (s) {
      s.reserved = Math.max(0, s.reserved - quantity);
    }
  }
}

class MockIdempotencyRepo implements IIdempotencyRepository {
  public records: Map<string, IdempotencyRecordProps> = new Map();

  async find(key: string): Promise<IdempotencyRecordProps | null> {
    return this.records.get(key) || null;
  }
  async save(record: IdempotencyRecordProps): Promise<void> {
    if (this.records.has(record.key)) {
      throw new Error('Unique constraint violation: Idempotency key already exists');
    }
    this.records.set(record.key, record);
  }
  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }
  async complete(key: string, responsePayload: unknown, statusCode: number, requestHash?: string): Promise<void> {
    const existing = this.records.get(key);
    if (existing) {
      existing.isCompleted = true;
      existing.responsePayload = responsePayload;
      existing.statusCode = statusCode;
      if (requestHash) existing.requestHash = requestHash;
    } else {
      this.records.set(key, {
        key,
        targetAction: 'CHECKOUT',
        requestHash: requestHash || 'hash',
        responsePayload,
        statusCode,
        isCompleted: true,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
    }
  }
}

describe('Checkout Concurrency, Transactions & Idempotency', () => {
  let orderRepo: MockOrderRepo;
  let stallRepo: MockStallRepo;
  let inventoryRepo: MockInventoryRepo;
  let idempotencyRepo: MockIdempotencyRepo;
  let checkoutService: CheckoutService;

  beforeEach(() => {
    orderRepo = new MockOrderRepo();
    stallRepo = new MockStallRepo();
    inventoryRepo = new MockInventoryRepo();
    idempotencyRepo = new MockIdempotencyRepo();
    checkoutService = new CheckoutService(orderRepo, stallRepo, inventoryRepo, idempotencyRepo);

    // Setup an approved open stall
    const stall = new StallAggregate({
      id: 'stall_dosa',
      ownerId: 'owner_1',
      name: 'Dosa Corner',
      campusBlock: 'Block A',
      liveStatus: StallStatus.OPEN,
      processingMode: OrderProcessingMode.AUTOMATIC,
      isApproved: true,
      operatingHours: [
        { id: 'h1', stallId: 'stall_dosa', dayOfWeek: 0, openTime: '00:00', closeTime: '23:59', isClosed: false },
        { id: 'h2', stallId: 'stall_dosa', dayOfWeek: 1, openTime: '00:00', closeTime: '23:59', isClosed: false },
        { id: 'h3', stallId: 'stall_dosa', dayOfWeek: 2, openTime: '00:00', closeTime: '23:59', isClosed: false },
        { id: 'h4', stallId: 'stall_dosa', dayOfWeek: 3, openTime: '00:00', closeTime: '23:59', isClosed: false },
        { id: 'h5', stallId: 'stall_dosa', dayOfWeek: 4, openTime: '00:00', closeTime: '23:59', isClosed: false },
        { id: 'h6', stallId: 'stall_dosa', dayOfWeek: 5, openTime: '00:00', closeTime: '23:59', isClosed: false },
        { id: 'h7', stallId: 'stall_dosa', dayOfWeek: 6, openTime: '00:00', closeTime: '23:59', isClosed: false },
      ],
    });
    stallRepo.save(stall);
  });

  test('concurrency protection: exactly 1 checkout succeeds on last inventory stock', async () => {
    // Only 1 Masala Dosa in stock
    inventoryRepo.stock.set('item_dosa_last', { available: 1, reserved: 0 });

    const req1 = {
      idempotencyKey: 'key_student_1',
      studentId: 'student_1',
      studentAccountStatus: StudentAccountStatus.ACTIVE,
      advancePercentage: 50,
      stallCarts: [{
        stallId: 'stall_dosa',
        items: [{ menuItemId: 'item_dosa_last', name: 'Masala Dosa', price: 60.00, preparationTimeMinutes: 8, quantity: 1 }],
      }],
    };

    const req2 = {
      idempotencyKey: 'key_student_2',
      studentId: 'student_2',
      studentAccountStatus: StudentAccountStatus.ACTIVE,
      advancePercentage: 50,
      stallCarts: [{
        stallId: 'stall_dosa',
        items: [{ menuItemId: 'item_dosa_last', name: 'Masala Dosa', price: 60.00, preparationTimeMinutes: 8, quantity: 1 }],
      }],
    };

    // Execute concurrently
    const results = await Promise.allSettled([
      checkoutService.executeCheckout(req1),
      checkoutService.executeCheckout(req2),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    // Assert final stock: available is 0, reserved is 1 (never negative!)
    const finalStock = inventoryRepo.stock.get('item_dosa_last')!;
    expect(finalStock.available).toBe(0);
    expect(finalStock.reserved).toBe(1);
  });

  test('transaction rollback: partial multi-stall failure releases previous stall reserved stock', async () => {
    // Setup Stall B
    const stallB = new StallAggregate({
      id: 'stall_tea',
      ownerId: 'owner_2',
      name: 'Chai Point',
      campusBlock: 'Block A',
      liveStatus: StallStatus.OPEN,
      processingMode: OrderProcessingMode.AUTOMATIC,
      isApproved: true,
      operatingHours: [
        { id: 'hb', stallId: 'stall_tea', dayOfWeek: new Date().getUTCDay(), openTime: '00:00', closeTime: '23:59', isClosed: false },
      ],
    });
    stallRepo.save(stallB);

    // Stall A item has stock (5), Stall B item is OUT OF STOCK (0)
    inventoryRepo.stock.set('item_dosa', { available: 5, reserved: 0 });
    inventoryRepo.stock.set('item_chai', { available: 0, reserved: 0 });

    const multiStallReq = {
      idempotencyKey: 'multi_fail_key',
      studentId: 'student_1',
      studentAccountStatus: StudentAccountStatus.ACTIVE,
      advancePercentage: 50,
      stallCarts: [
        {
          stallId: 'stall_dosa',
          items: [{ menuItemId: 'item_dosa', name: 'Masala Dosa', price: 60.00, preparationTimeMinutes: 8, quantity: 1 }],
        },
        {
          stallId: 'stall_tea',
          items: [{ menuItemId: 'item_chai', name: 'Masala Chai', price: 15.00, preparationTimeMinutes: 3, quantity: 1 }],
        },
      ],
    };

    // Expect checkout to fail due to item_chai being out of stock
    await expect(checkoutService.executeCheckout(multiStallReq)).rejects.toThrow(ConflictError);

    // Assert rollback: Stall A stock must be completely released back to 5 available, 0 reserved!
    const dosaStock = inventoryRepo.stock.get('item_dosa')!;
    expect(dosaStock.available).toBe(5);
    expect(dosaStock.reserved).toBe(0);

    // Assert no orphan MasterOrder or SubOrder records were committed
    expect(orderRepo.orders.size).toBe(0);
    expect(orderRepo.subOrders.size).toBe(0);
  });

  test('idempotency: replayed checkout returns identical result without duplicating orders', async () => {
    inventoryRepo.stock.set('item_dosa_idem', { available: 10, reserved: 0 });

    const req = {
      idempotencyKey: 'idem_key_unique_101',
      studentId: 'student_1',
      studentAccountStatus: StudentAccountStatus.ACTIVE,
      advancePercentage: 50,
      stallCarts: [{
        stallId: 'stall_dosa',
        items: [{ menuItemId: 'item_dosa_idem', name: 'Masala Dosa', price: 60.00, preparationTimeMinutes: 8, quantity: 1 }],
      }],
    };

    const firstResult = await checkoutService.executeCheckout(req);
    const secondResult = await checkoutService.executeCheckout(req);

    // Exact identical canonical response
    expect(secondResult.masterOrderId).toBe(firstResult.masterOrderId);
    expect(secondResult.orderNumber).toBe(firstResult.orderNumber);

    // Exactly 1 order in repository, NOT 2
    expect(orderRepo.orders.size).toBe(1);
    expect(orderRepo.subOrders.size).toBe(1);

    // Stock reserved exactly once: available 9, reserved 1
    const stock = inventoryRepo.stock.get('item_dosa_idem')!;
    expect(stock.available).toBe(9);
    expect(stock.reserved).toBe(1);
  });

  test('unverified student is rejected before touching inventory or creating orders', async () => {
    inventoryRepo.stock.set('item_dosa', { available: 10, reserved: 0 });

    const unverifiedReq = {
      idempotencyKey: 'unverified_key',
      studentId: 'student_unverified',
      studentAccountStatus: StudentAccountStatus.PENDING_VERIFICATION, // Not ACTIVE
      advancePercentage: 50,
      stallCarts: [{
        stallId: 'stall_dosa',
        items: [{ menuItemId: 'item_dosa', name: 'Masala Dosa', price: 60.00, preparationTimeMinutes: 8, quantity: 1 }],
      }],
    };

    await expect(checkoutService.executeCheckout(unverifiedReq)).rejects.toThrow(UnverifiedStudentError);

    // Zero stock touched
    expect(inventoryRepo.stock.get('item_dosa')!.available).toBe(10);
    expect(orderRepo.orders.size).toBe(0);
  });
});
