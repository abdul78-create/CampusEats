import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ForbiddenError } from '../../../shared/errors/DomainErrors.js';

export interface StorageUploadResult {
  storagePath: string;
  url: string;
  sha256Checksum: string;
  sizeBytes: number;
  mimeType: string;
}

export interface IStorageProvider {
  uploadFile(fileBuffer: Buffer, originalFilename: string, mimeType: string, ownerId?: string): Promise<StorageUploadResult>;
  getSignedUrl(storagePath: string, expiresInSeconds?: number): Promise<string>;
  verifySignedUrlToken(storagePath: string, expires: number, signature: string): boolean;
  getSignedFile(storagePath: string, expires: number, signature: string): Promise<Buffer>;
  getFile(storagePath: string): Promise<Buffer>;
  deleteFile(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
}

// Backward-compatible alias
export type StorageProvider = IStorageProvider;

/**
 * Local file storage implementation for development and test execution.
 * Writes to a dedicated private directory that is excluded from source control.
 * Raw bytes are never stored in PostgreSQL, and files are never publicly exposed.
 */
export class LocalStorageProvider implements IStorageProvider {
  private readonly baseStorageDir: string;
  private readonly signingSecret: string;

  constructor(baseStorageDir = './storage/uploads', signingSecret?: string) {
    this.baseStorageDir = path.resolve(baseStorageDir);
    this.signingSecret = signingSecret || process.env.STORAGE_SIGNING_SECRET || process.env.JWT_ACCESS_SECRET || 'dev_storage_secret_key_ce2026';
  }

  async uploadFile(
    fileBuffer: Buffer, 
    originalFilename: string, 
    mimeType: string,
    _ownerId?: string
  ): Promise<StorageUploadResult> {
    await fs.mkdir(this.baseStorageDir, { recursive: true });

    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const safeExtension = path.extname(originalFilename).toLowerCase() || '.bin';
    
    // Server-side unguessable identifier to prevent filename enumeration/spoofing
    const uniqueFilename = `id_doc_${crypto.randomUUID()}${safeExtension}`;
    const targetFilePath = path.join(this.baseStorageDir, uniqueFilename);

    await fs.writeFile(targetFilePath, fileBuffer);

    return {
      storagePath: uniqueFilename,
      url: `/api/v1/storage/documents/${uniqueFilename}`,
      sha256Checksum: checksum,
      sizeBytes: fileBuffer.length,
      mimeType,
    };
  }

  /**
   * Generates a temporary, cryptographically signed URL with short expiration.
   * Default expiration: 300 seconds (5 minutes).
   */
  async getSignedUrl(storagePath: string, expiresInSeconds = 300): Promise<string> {
    const sanitizedPath = path.basename(storagePath);
    if (sanitizedPath !== storagePath) {
      throw new ForbiddenError('Path traversal detected in storage path');
    }

    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const payload = `${sanitizedPath}:${expiresAt}`;
    const signature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('hex');

    return `/api/v1/storage/documents/download?path=${encodeURIComponent(sanitizedPath)}&expires=${expiresAt}&signature=${signature}`;
  }

  /**
   * Validates a signed URL token and expiration.
   */
  verifySignedUrlToken(storagePath: string, expires: number, signature: string): boolean {
    const currentEpochSeconds = Math.floor(Date.now() / 1000);
    if (currentEpochSeconds > expires) {
      return false; // Expired
    }

    const sanitizedPath = path.basename(storagePath);
    if (sanitizedPath !== storagePath) {
      return false; // Traversal attempt
    }

    const payload = `${sanitizedPath}:${expires}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * Retrieves file contents ONLY after verifying that the temporary signed URL token
   * has not expired and its cryptographic HMAC-SHA256 signature is valid.
   * Throws ForbiddenError if the signature is invalid, forged, or expired.
   */
  async getSignedFile(storagePath: string, expires: number, signature: string): Promise<Buffer> {
    const isValid = this.verifySignedUrlToken(storagePath, expires, signature);
    if (!isValid) {
      throw new ForbiddenError('Signed URL has expired or cryptographic signature is invalid');
    }
    return this.getFile(storagePath);
  }

  async getFile(storagePath: string): Promise<Buffer> {
    const sanitizedPath = path.basename(storagePath);
    if (sanitizedPath !== storagePath) {
      throw new ForbiddenError('Path traversal sequence detected in storage path');
    }

    const fullPath = path.join(this.baseStorageDir, sanitizedPath);
    return fs.readFile(fullPath);
  }

  async deleteFile(storagePath: string): Promise<void> {
    const sanitizedPath = path.basename(storagePath);
    if (sanitizedPath !== storagePath) {
      throw new ForbiddenError('Path traversal sequence detected in storage path');
    }

    const fullPath = path.join(this.baseStorageDir, sanitizedPath);
    try {
      await fs.unlink(fullPath);
    } catch {
      // Idempotent: ignore if already unlinked
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    const sanitizedPath = path.basename(storagePath);
    if (sanitizedPath !== storagePath) {
      return false;
    }

    const fullPath = path.join(this.baseStorageDir, sanitizedPath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
