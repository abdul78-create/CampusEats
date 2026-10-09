import { DocumentValidationService } from '../../../src/modules/identity/domain/DocumentValidationService.js';
import { ValidationError } from '../../../src/shared/errors/DomainErrors.js';

describe('DocumentValidationService Content & Format Security', () => {
  describe('Authoritative Content Signature Validation', () => {
    test('accepts genuine PDF document starting with %PDF magic bytes', () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
      const result = DocumentValidationService.validate(pdfBuffer, 'university_id.pdf');

      expect(result.detectedMimeType).toBe('application/pdf');
      expect(result.extension).toBe('.pdf');
      expect(result.fileSizeBytes).toBe(pdfBuffer.length);
      expect(result.sha256Checksum).toHaveLength(64);
      expect(result.sanitizedFilename).toBe('university_id.pdf');
    });

    test('accepts genuine JPEG image starting with FF D8 FF magic bytes', () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
      const result = DocumentValidationService.validate(jpegBuffer, 'student_photo.jpg');

      expect(result.detectedMimeType).toBe('image/jpeg');
      expect(result.extension).toBe('.jpg');
      expect(result.fileSizeBytes).toBe(jpegBuffer.length);
      expect(result.sanitizedFilename).toBe('student_photo.jpg');
    });

    test('accepts genuine PNG image starting with 89 50 4E 47 0D 0A 1A 0A magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
      const result = DocumentValidationService.validate(pngBuffer, 'id_card_scan.png');

      expect(result.detectedMimeType).toBe('image/png');
      expect(result.extension).toBe('.png');
      expect(result.fileSizeBytes).toBe(pngBuffer.length);
      expect(result.sanitizedFilename).toBe('id_card_scan.png');
    });

    test('rejects empty document buffer', () => {
      expect(() => {
        DocumentValidationService.validate(Buffer.alloc(0), 'empty.pdf');
      }).toThrow(ValidationError);
    });

    test('rejects document exceeding 5 MB limit', () => {
      // 5 MB + 1 byte
      const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
      // Prepend valid PDF header
      Buffer.from('%PDF').copy(oversizedBuffer);

      expect(() => {
        DocumentValidationService.validate(oversizedBuffer, 'huge_document.pdf');
      }).toThrow(ValidationError);
    });
  });

  describe('Malicious Disguise & Active Code Defense', () => {
    test('rejects executable disguised as PDF (MZ Windows executable header)', () => {
      const mzExecutable = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF');
      expect(() => {
        DocumentValidationService.validate(mzExecutable, 'university_id.pdf');
      }).toThrow('Executable binary files');
    });

    test('rejects Linux ELF binary disguised as PNG', () => {
      const elfBinary = Buffer.from('\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00');
      expect(() => {
        DocumentValidationService.validate(elfBinary, 'student_id.png');
      }).toThrow('ELF binaries');
    });

    test('rejects ZIP archive disguised as JPEG (PK header)', () => {
      const zipArchive = Buffer.from('PK\x03\x04\x14\x00\x00\x00\x08\x00');
      expect(() => {
        DocumentValidationService.validate(zipArchive, 'student_card.jpg');
      }).toThrow('Compressed archive files');
    });

    test('rejects embedded script or HTML injection payload', () => {
      const scriptPayload = Buffer.from('<script>alert("malicious xss attack")</script>');
      expect(() => {
        DocumentValidationService.validate(scriptPayload, 'card.pdf');
      }).toThrow('Script files and active code');
    });

    test('rejects PHP code payload', () => {
      const phpPayload = Buffer.from('<?php phpinfo(); ?>');
      expect(() => {
        DocumentValidationService.validate(phpPayload, 'upload.png');
      }).toThrow('Script files and active code');
    });
  });

  describe('Filename Sanitization & Path Traversal Prevention', () => {
    test('neutralizes directory traversal sequences in filename', () => {
      expect(DocumentValidationService.sanitizeFilename('../../etc/passwd')).toBe('passwd');
      expect(DocumentValidationService.sanitizeFilename('..\\..\\Windows\\System32\\cmd.exe')).toBe('cmd.exe');
      expect(DocumentValidationService.sanitizeFilename('folder/subfolder/document.pdf')).toBe('document.pdf');
    });

    test('strips control characters and illegal symbols', () => {
      expect(DocumentValidationService.sanitizeFilename('bad\x00file\x1Fname:?"*.pdf')).toBe('badfilename.pdf');
    });

    test('handles empty or missing filenames safely', () => {
      expect(DocumentValidationService.sanitizeFilename('')).toBe('identity_document');
      expect(DocumentValidationService.sanitizeFilename('   ')).toBe('identity_document');
    });
  });
});
