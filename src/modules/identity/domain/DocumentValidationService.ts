import * as crypto from 'crypto';
import * as path from 'path';
import { ValidationError } from '../../../shared/errors/DomainErrors.js';

export interface DocumentValidationResult {
  detectedMimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  extension: '.pdf' | '.jpg' | '.png';
  fileSizeBytes: number;
  sha256Checksum: string;
  sanitizedFilename: string;
}

export class DocumentValidationService {
  public static readonly MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

  // Authoritative magic byte signatures
  private static readonly PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
  private static readonly JPEG_MAGIC = Buffer.from([0xFF, 0xD8, 0xFF]);
  private static readonly PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // Forbidden executable & archive signatures (disguise prevention)
  private static readonly DOS_MZ_MAGIC = Buffer.from([0x4D, 0x5A]); // MZ (Windows PE, .exe, .dll)
  private static readonly ELF_MAGIC = Buffer.from([0x7F, 0x45, 0x4C, 0x46]); // \x7fELF (Linux binary)
  private static readonly ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // PK.. (ZIP, JAR, APK)

  /**
   * Performs deep content signature and format validation.
   * Client-supplied MIME types and file extensions are strictly untrusted.
   */
  public static validate(buffer: Buffer, originalFilename: string): DocumentValidationResult {
    if (!buffer || buffer.length === 0) {
      throw new ValidationError('Uploaded identity document is empty');
    }

    if (buffer.length > this.MAX_FILE_SIZE_BYTES) {
      const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
      throw new ValidationError(
        `File size (${sizeMb} MB) exceeds the maximum allowed limit of 5 MB`
      );
    }

    // 1. Proactively inspect and reject dangerous executable or archive headers
    if (buffer.length >= 2 && buffer.subarray(0, 2).equals(this.DOS_MZ_MAGIC)) {
      throw new ValidationError('Executable binary files (.exe / .dll) are strictly prohibited');
    }
    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(this.ELF_MAGIC)) {
      throw new ValidationError('ELF binaries and executables are strictly prohibited');
    }
    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(this.ZIP_MAGIC)) {
      throw new ValidationError('Compressed archive files (.zip / .jar) are not accepted');
    }

    // 2. Reject embedded script tags and server-side script signatures
    const sample = buffer.subarray(0, Math.min(buffer.length, 128)).toString('utf8').toLowerCase();
    if (
      sample.includes('<script') || 
      sample.includes('<?php') || 
      sample.includes('#!/bin/') ||
      sample.includes('eval(')
    ) {
      throw new ValidationError('Script files and active code are strictly prohibited');
    }

    // 3. Authoritative magic byte validation for accepted formats
    let detectedMimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
    let extension: '.pdf' | '.jpg' | '.png';

    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(this.PDF_MAGIC)) {
      detectedMimeType = 'application/pdf';
      extension = '.pdf';
    } else if (buffer.length >= 3 && buffer.subarray(0, 3).equals(this.JPEG_MAGIC)) {
      detectedMimeType = 'image/jpeg';
      extension = '.jpg';
    } else if (buffer.length >= 8 && buffer.subarray(0, 8).equals(this.PNG_MAGIC)) {
      detectedMimeType = 'image/png';
      extension = '.png';
    } else {
      throw new ValidationError(
        'Unsupported document format. Only genuine PDF, JPEG, and PNG files are accepted based on content signature inspection.'
      );
    }

    // 4. Sanitize original filename (prevent directory traversal and illegal characters)
    const sanitizedFilename = this.sanitizeFilename(originalFilename);

    // 5. Compute SHA-256 checksum for immutable verification tracking
    const sha256Checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      detectedMimeType,
      extension,
      fileSizeBytes: buffer.length,
      sha256Checksum,
      sanitizedFilename,
    };
  }

  /**
   * Sanitizes filenames to eliminate directory traversal sequences (../, ..\),
   * control characters, and illegal path characters.
   */
  public static sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      return 'identity_document';
    }
    // Extract base name, strip directory separators
    const base = path.basename(filename).replace(/[\/\\]/g, '');
    // Remove control characters (ASCII 0-31, 127) and filesystem reserved chars
    const clean = base.replace(/[\x00-\x1F\x7F<>:"|?*]/g, '').trim();
    // Prevent hidden files (leading dots) and empty names
    const strippedLeadingDots = clean.replace(/^\.+/, '');
    return strippedLeadingDots || 'identity_document';
  }
}
