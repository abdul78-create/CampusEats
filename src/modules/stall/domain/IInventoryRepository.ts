import { InventoryRecord } from './InventoryRecord.js';

export interface IInventoryRepository {
  findByMenuItemId(menuItemId: string): Promise<InventoryRecord | null>;
  save(record: InventoryRecord): Promise<void>;
  /**
   * Atomically decrements availableQuantity and increments reservedQuantity.
   * Throws ConflictError if available stock < requested quantity.
   */
  reserveStockAtomic(menuItemId: string, quantity: number): Promise<void>;
  releaseStockAtomic(menuItemId: string, quantity: number): Promise<void>;
  commitStockAtomic(menuItemId: string, quantity: number): Promise<void>;
}
