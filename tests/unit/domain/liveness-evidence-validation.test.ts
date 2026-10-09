import { describe, test, expect } from '@jest/globals';
import crypto from 'node:crypto';
import { LivenessEvidenceValidator } from '../../../src/modules/identity/domain/LivenessEvidenceValidator.js';

describe('LivenessEvidenceValidator Engine', () => {
  describe('Format & Magic Bytes Deep Inspection', () => {
    test('accepts valid WebM video stream with EBML header', () => {
      const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x1f]);
      const payload = Buffer.concat([ebmlHeader, Buffer.from('webm_payload_data')]);

      const result = LivenessEvidenceValidator.validate(payload, 'recording.webm');
      expect(result.detectedMimeType).toBe('video/webm');
      expect(result.sanitizedFilename).toMatch(/^liveness_[a-f0-9-]+\.webm$/);
      expect(result.sizeBytes).toBe(payload.length);
      expect(result.sha256Digest).toBe(crypto.createHash('sha256').update(payload).digest('hex'));
    });

    test('accepts valid MP4 video container with ftyp atom', () => {
      // Offset 0-3: box size (0x00000020), Offset 4-7: 'ftyp'
      const mp4Header = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x20]),
        Buffer.from('ftyp', 'ascii'),
        Buffer.from('mp42', 'ascii'),
      ]);
      const payload = Buffer.concat([mp4Header, Buffer.from('mp4_payload_data')]);

      const result = LivenessEvidenceValidator.validate(payload, 'recording.mp4');
      expect(result.detectedMimeType).toBe('video/mp4');
      expect(result.sanitizedFilename).toMatch(/^liveness_[a-f0-9-]+\.mp4$/);
    });

    test('strictly rejects static JPEG image spoof attempt', () => {
      const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const payload = Buffer.concat([jpegMagic, Buffer.from('static_jpeg_photo_content')]);

      expect(() => {
        LivenessEvidenceValidator.validate(payload, 'selfie.jpg');
      }).toThrow('static images are rejected');
    });

    test('strictly rejects static PNG image spoof attempt', () => {
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const payload = Buffer.concat([pngMagic, Buffer.from('static_png_photo_content')]);

      expect(() => {
        LivenessEvidenceValidator.validate(payload, 'id_photo.png');
      }).toThrow('static images are rejected');
    });

    test('rejects arbitrary binary or text files disguised as video', () => {
      const textBuffer = Buffer.from('This is a text file not a video');
      expect(() => {
        LivenessEvidenceValidator.validate(textBuffer, 'fake.webm');
      }).toThrow('Unsupported video format: Evidence must be a valid WebM (video/webm) or MP4 (video/mp4) stream');
    });
  });

  describe('Buffer Constraints & SHA-256 Digest', () => {
    test('rejects empty evidence buffer', () => {
      expect(() => {
        LivenessEvidenceValidator.validate(Buffer.alloc(0), 'empty.webm');
      }).toThrow('Evidence video buffer is empty');
    });

    test('rejects oversized video evidence (> 10MB)', () => {
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
      // Put valid WebM header so size check triggers
      oversized[0] = 0x1a;
      oversized[1] = 0x45;
      oversized[2] = 0xdf;
      oversized[3] = 0xa3;

      expect(() => {
        LivenessEvidenceValidator.validate(oversized, 'huge.webm');
      }).toThrow('exceeds maximum size of 10 MB');
    });

    test('computes deterministic SHA-256 digest for Exact Evidence Byte-Replay Prevention', () => {
      const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      const payload = Buffer.concat([ebmlHeader, Buffer.from('exact_byte_dedup_test')]);

      const result1 = LivenessEvidenceValidator.validate(payload, 'test1.webm');
      const result2 = LivenessEvidenceValidator.validate(payload, 'test2.webm');

      expect(result1.sha256Digest).toBe(result2.sha256Digest);
      expect(result1.sha256Digest).toBe(crypto.createHash('sha256').update(payload).digest('hex'));
    });
  });
});
