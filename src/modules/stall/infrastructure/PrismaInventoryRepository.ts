import { PrismaClient } from '@prisma/client';
import { IInventoryRepository } from '../domain/IInventoryRepository.js';
import { InventoryRecord } from '../domain/InventoryRecord.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/DomainErrors.js';

export class PrismaInventoryRepository implements IInventoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByMenuItemId(menuItemId: string): Promise<InventoryRecord | null> {
    const raw = await this.prisma.menuItemInventory.findUnique({
      where: { menuItemId },
    });
    if (!raw) return null;

    return new InventoryRecord({
      id: raw.id,
      menuItemId: raw.menuItemId,
      availableQuantity: raw.availableQuantity,
      reservedQuantity: raw.reservedQuantity,
    });
  }

  async save(record: InventoryRecord): Promise<void> {
    await this.prisma.menuItemInventory.upsert({
      where: { menuItemId: record.menuItemId },
      create: {
        id: record.id,
        menuItemId: record.menuItemId,
        availableQuantity: record.availableQuantity,
        reservedQuantity: record.reservedQuantity,
      },
      update: {
        availableQuantity: record.availableQuantity,
        reservedQuantity: record.reservedQuantity,
      },
    });
  }

  /**
   * Atomically decrements availableQuantity and increments reservedQuantity.
   * Uses conditional atomic update with row matching to guarantee no overselling under concurrency.
   */
  async reserveStockAtomic(menuItemId: string, quantity: number): Promise<void> {
    const updated = await this.prisma.$executeRaw`
      UPDATE "MenuItemInventory"
      SET "availableQuantity" = "availableQuantity" - ${quantity},
          "reservedQuantity" = "reservedQuantity" + ${quantity},
          "updatedAt" = NOW()
      WHERE "menuItemId" = ${menuItemId}
        AND "availableQuantity" >= ${quantity}
    `;

    if (updated === 0) {
      // Check whether item exists or genuinely out of stock
      const exists = await this.prisma.menuItemInventory.findUnique({
        where: { menuItemId },
      });
      if (!exists) {
        throw new NotFoundError(`Inventory for menu item ${menuItemId} does not exist`);
      }
      throw new ConflictError(
        `Insufficient inventory stock for menu item ${menuItemId}. Requested: ${quantity}, Available: ${exists.availableQuantity}`
      );
    }
  }

  async releaseStockAtomic(menuItemId: string, quantity: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "MenuItemInventory"
      SET "availableQuantity" = "availableQuantity" + ${quantity},
          "reservedQuantity" = GREATEST(0, "reservedQuantity" - ${quantity}),
          "updatedAt" = NOW()
      WHERE "menuItemId" = ${menuItemId}
    `;
  }

  async commitStockAtomic(menuItemId: string, quantity: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "MenuItemInventory"
      SET "reservedQuantity" = GREATEST(0, "reservedQuantity" - ${quantity}),
          "updatedAt" = NOW()
      WHERE "menuItemId" = ${menuItemId}
    `;
  }
}
