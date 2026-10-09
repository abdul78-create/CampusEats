import * as crypto from 'crypto';

/**
 * Human-friendly student-facing order identifier.
 * Format: CE-YYYYMMDD-XXXXXX (e.g. CE-20260924-A89F12)
 * Decoupled from internal database UUIDs to prevent sequential ID guessing.
 */
export class OrderNumber {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public getValue(): string {
    return this.value;
  }

  public static generate(prefix = 'CE'): OrderNumber {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();

    return new OrderNumber(`${prefix}-${year}${month}${day}-${randomHex}`);
  }

  public static generateSubOrderNumber(masterOrderNumber: string, stallIndex: number): string {
    return `${masterOrderNumber}-S${stallIndex}`;
  }

  public static fromExisting(value: string): OrderNumber {
    if (!value || typeof value !== 'string') {
      throw new Error('Invalid order number string');
    }
    return new OrderNumber(value);
  }
}
