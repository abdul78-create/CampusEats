import crypto from 'node:crypto';
import { ValidationError } from '../../../shared/errors/DomainErrors.js';

export interface ValidatedEvidenceResult {
  sanitizedFilename: string;
  detectedMimeType: string;
  sha256Digest: string;
  sizeBytes: number;
}

export class LivenessEvidenceValidator {
  public static readonly MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

  /**
   * Performs deep signature inspection on submitted liveness video evidence.
   * Strictly rejects static images (JPEG/PNG) and enforces temporal video formats (WebM/MP4).
   */
  public static validate(buffer: Buffer, _originalFilename?: string): ValidatedEvidenceResult {
    if (!buffer || buffer.length === 0) {
      throw new ValidationError('Evidence video buffer is empty');
    }

    if (buffer.length > this.MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(`Evidence video exceeds maximum size of 10 MB (${buffer.length} bytes received)`);
    }

    // 1. Detect static images and strictly reject them
    if (this.isJpeg(buffer) || this.isPng(buffer)) {
      throw new ValidationError('Active liveness requires temporal video evidence; static images are rejected');
    }

    // 2. Validate video container signature (WebM or MP4)
    let detectedMimeType: string | null = null;
    if (this.isWebM(buffer)) {
      detectedMimeType = 'video/webm';
    } else if (this.isMp4(buffer)) {
      detectedMimeType = 'video/mp4';
    } else {
      throw new ValidationError('Unsupported video format: Evidence must be a valid WebM (video/webm) or MP4 (video/mp4) stream');
    }

    // 3. Compute SHA-256 byte digest for exact-evidence replay prevention
    const sha256Digest = crypto.createHash('sha256').update(buffer).digest('hex');

    // 4. Sanitize filename to prevent path traversal
    const safeExtension = detectedMimeType === 'video/webm' ? '.webm' : '.mp4';
    const sanitizedFilename = `liveness_${crypto.randomUUID()}${safeExtension}`;

    return {
      sanitizedFilename,
      detectedMimeType,
      sha256Digest,
      sizeBytes: buffer.length,
    };
  }

  private static isWebM(buf: Buffer): boolean {
    // EBML header: 0x1A 0x45 0xDF 0xA3
    if (buf.length < 4) return false;
    return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  }

  private static isMp4(buf: Buffer): boolean {
    // MP4 container: 'ftyp' at offset 4
    if (buf.length < 8) return false;
    const ftyp = buf.toString('ascii', 4, 8);
    return ftyp === 'ftyp';
  }

  private static isJpeg(buf: Buffer): boolean {
    // JPEG: 0xFF 0xD8 0xFF
    if (buf.length < 3) return false;
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }

  private static isPng(buf: Buffer): boolean {
    // PNG: 0x89 0x50 0x4E 0x47
    if (buf.length < 4) return false;
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
}
