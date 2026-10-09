// Cryptographic SHA-256 Hash Chain Utilities
import * as crypto from 'crypto';

export class HashChainUtil {
  /**
   * Deterministically stringifies an object by recursively sorting its keys.
   */
  public static canonicalJson(data: unknown): string {
    if (data === null || data === undefined) {
      return '';
    }
    if (typeof data !== 'object') {
      return JSON.stringify(data);
    }
    if (Array.isArray(data)) {
      return '[' + data.map(item => HashChainUtil.canonicalJson(item)).join(',') + ']';
    }

    const sortedKeys = Object.keys(data as Record<string, unknown>).sort();
    const parts: string[] = [];
    for (const key of sortedKeys) {
      const val = (data as Record<string, unknown>)[key];
      parts.push(`${JSON.stringify(key)}:${HashChainUtil.canonicalJson(val)}`);
    }
    return '{' + parts.join(',') + '}';
  }

  /**
   * Computes SHA-256 digest of input string.
   */
  public static sha256(input: string): string {
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  }

  /**
   * Calculates the current audit hash by chaining the previous hash and entry attributes.
   */
  public static calculateAuditHash(params: {
    sequenceNumber: bigint | number;
    previousHash: string;
    actorId: string | null;
    actionType: string;
    targetEntity: string;
    targetId: string;
    previousValue: unknown;
    newValue: unknown;
    timestamp: string | Date;
  }): string {
    const ts = typeof params.timestamp === 'string' 
      ? params.timestamp 
      : params.timestamp.toISOString();

    const payload = [
      params.sequenceNumber.toString(),
      params.previousHash,
      params.actorId || 'SYSTEM',
      params.actionType,
      params.targetEntity,
      params.targetId,
      HashChainUtil.canonicalJson(params.previousValue),
      HashChainUtil.canonicalJson(params.newValue),
      ts,
    ].join('|');

    return HashChainUtil.sha256(payload);
  }
}
