import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../../shared/errors/DomainErrors.js';

// Memory storage keeps uploaded bytes in a temporary memory Buffer
// Raw document bytes are NEVER persisted to PostgreSQL or exposed directly.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB strictly enforced on actual file
    files: 1,
  },
});

export const documentUploadMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Reject application/json directly: JSON Base64 upload is strictly forbidden
  if (req.is('application/json') || req.body?.documentBase64) {
    next(new ValidationError('Document upload must be submitted as multipart/form-data with field name "file" or "document". JSON Base64 payloads are not supported.'));
    return;
  }

  // Handle multipart/form-data upload accepting either 'file' or 'document'
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'document', maxCount: 1 },
  ])(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new ValidationError('File size exceeds maximum allowed limit of 5 MB'));
        return;
      }
      next(new ValidationError(`File upload error: ${err.message}`));
      return;
    } else if (err) {
      next(err);
      return;
    }

    // Populate req.file for downstream controller consumption
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (files) {
      if (files['file'] && files['file'].length > 0) {
        req.file = files['file'][0];
      } else if (files['document'] && files['document'].length > 0) {
        req.file = files['document'][0];
      }
    }

    next();
  });
};

const livenessUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB strictly enforced on temporal video file
    files: 1,
  },
});

export const livenessEvidenceUploadMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Reject application/json directly: JSON Base64 upload is strictly forbidden
  if (req.is('application/json') || req.body?.videoBase64 || req.body?.evidenceBase64) {
    next(new ValidationError('Liveness evidence upload must be submitted as multipart/form-data with field name "evidence", "video", or "file". JSON Base64 payloads are not supported.'));
    return;
  }

  livenessUpload.fields([
    { name: 'evidence', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ])(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new ValidationError('Video evidence size exceeds maximum allowed limit of 10 MB'));
        return;
      }
      next(new ValidationError(`Video upload error: ${err.message}`));
      return;
    } else if (err) {
      next(err);
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (files) {
      if (files['evidence'] && files['evidence'].length > 0) {
        req.file = files['evidence'][0];
      } else if (files['video'] && files['video'].length > 0) {
        req.file = files['video'][0];
      } else if (files['file'] && files['file'].length > 0) {
        req.file = files['file'][0];
      }
    }

    next();
  });
};
