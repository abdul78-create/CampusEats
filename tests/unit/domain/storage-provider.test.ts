import * as fs from 'fs/promises';
import * as path from 'path';
import { LocalStorageProvider } from '../../../src/modules/identity/domain/StorageProvider.js';
import { ForbiddenError } from '../../../src/shared/errors/DomainErrors.js';

describe('LocalStorageProvider Storage Abstraction & Token Security', () => {
  const testStorageDir = './storage/test_uploads';
  let storageProvider: LocalStorageProvider;

  beforeAll(async () => {
    storageProvider = new LocalStorageProvider(testStorageDir, 'test_signing_secret_ce2026');
  });

  afterAll(async () => {
    try {
      await fs.rm(testStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  test('uploadFile stores file in private directory with unguessable identifier and returns metadata', async () => {
    const content = Buffer.from('%PDF-1.4 sample content');
    const result = await storageProvider.uploadFile(content, 'my_id.pdf', 'application/pdf');

    expect(result.storagePath).toMatch(/^id_doc_[0-9a-f-]+(?:\.pdf|\.bin)$/);
    expect(result.sizeBytes).toBe(content.length);
    expect(result.sha256Checksum).toHaveLength(64);
    expect(result.mimeType).toBe('application/pdf');

    const exists = await storageProvider.exists(result.storagePath);
    expect(exists).toBe(true);

    const readBack = await storageProvider.getFile(result.storagePath);
    expect(readBack.toString()).toBe(content.toString());
  });

  test('getSignedUrl generates temporary HMAC-signed URL with expiry timestamp', async () => {
    const content = Buffer.from('photo content');
    const { storagePath } = await storageProvider.uploadFile(content, 'photo.jpg', 'image/jpeg');

    const signedUrl = await storageProvider.getSignedUrl(storagePath, 300); // 5 minutes
    expect(signedUrl).toContain('/api/v1/storage/documents/download?');
    expect(signedUrl).toContain(`path=${encodeURIComponent(storagePath)}`);
    expect(signedUrl).toContain('expires=');
    expect(signedUrl).toContain('signature=');

    // Parse URL params
    const urlObj = new URL(signedUrl, 'http://localhost');
    const pathParam = urlObj.searchParams.get('path')!;
    const expiresParam = parseInt(urlObj.searchParams.get('expires')!, 10);
    const signatureParam = urlObj.searchParams.get('signature')!;

    const isValid = storageProvider.verifySignedUrlToken(pathParam, expiresParam, signatureParam);
    expect(isValid).toBe(true);
  });

  test('verifySignedUrlToken rejects expired signed URL token', async () => {
    const storagePath = 'id_doc_sample.pdf';
    const expiredEpoch = Math.floor(Date.now() / 1000) - 10; // 10 seconds in the past
    const dummySignature = 'abcdef1234567890';

    const isValid = storageProvider.verifySignedUrlToken(storagePath, expiredEpoch, dummySignature);
    expect(isValid).toBe(false);
  });

  test('verifySignedUrlToken rejects tampered signature or altered storage path', async () => {
    const storagePath = 'id_doc_sample.pdf';
    const validFuture = Math.floor(Date.now() / 1000) + 300;
    const fakeSignature = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    const isValid = storageProvider.verifySignedUrlToken(storagePath, validFuture, fakeSignature);
    expect(isValid).toBe(false);
  });

  test('getSignedFile returns file buffer on valid signature, but rejects tampered or expired tokens with ForbiddenError', async () => {
    const content = Buffer.from('confidential student document buffer');
    const { storagePath } = await storageProvider.uploadFile(content, 'test_doc.pdf', 'application/pdf');

    const signedUrl = await storageProvider.getSignedUrl(storagePath, 300);
    const urlObj = new URL(signedUrl, 'http://localhost');
    const pathParam = urlObj.searchParams.get('path')!;
    const expiresParam = parseInt(urlObj.searchParams.get('expires')!, 10);
    const signatureParam = urlObj.searchParams.get('signature')!;

    // Valid signed retrieval
    const retrieved = await storageProvider.getSignedFile(pathParam, expiresParam, signatureParam);
    expect(retrieved.toString()).toBe(content.toString());

    // Expired token throws ForbiddenError
    const expiredEpoch = Math.floor(Date.now() / 1000) - 1;
    await expect(storageProvider.getSignedFile(pathParam, expiredEpoch, signatureParam)).rejects.toThrow(ForbiddenError);

    // Tampered signature throws ForbiddenError
    await expect(storageProvider.getSignedFile(pathParam, expiresParam, 'tampered_bad_sig')).rejects.toThrow(ForbiddenError);
  });

  test('getSignedUrl and getFile strictly block directory traversal attempts in storage path', async () => {
    const maliciousTraversal = '../../etc/passwd';

    await expect(storageProvider.getSignedUrl(maliciousTraversal, 300)).rejects.toThrow(ForbiddenError);
    await expect(storageProvider.getFile(maliciousTraversal)).rejects.toThrow(ForbiddenError);
    await expect(storageProvider.deleteFile(maliciousTraversal)).rejects.toThrow(ForbiddenError);
  });

  test('deleteFile idempotently removes uploaded object', async () => {
    const content = Buffer.from('temporary doc to delete');
    const { storagePath } = await storageProvider.uploadFile(content, 'temp.pdf', 'application/pdf');

    expect(await storageProvider.exists(storagePath)).toBe(true);
    await storageProvider.deleteFile(storagePath);
    expect(await storageProvider.exists(storagePath)).toBe(false);

    // Subsequent delete should not throw
    await expect(storageProvider.deleteFile(storagePath)).resolves.not.toThrow();
  });
});
