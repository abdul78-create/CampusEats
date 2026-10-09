import { Request, Response, NextFunction } from 'express';
import { StudentVerificationService } from '../application/StudentVerificationService.js';
import { ValidationError, UnauthorizedError } from '../../../shared/errors/DomainErrors.js';

export class StudentVerificationController {
  constructor(private readonly service: StudentVerificationService) {}

  /**
   * GET /api/v1/student/profile
   * Retrieves authenticated student profile and verification state.
   */
  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const profile = await this.service.getStudentProfile(req.user.id);
      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/student/verification/status
   * Retrieves authenticated student's current verification lifecycle status.
   */
  getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const status = await this.service.getVerificationStatus(req.user.id);
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/student/verification/document
   * Submits student identity document (strictly multipart/form-data with 5 MB limit).
   */
  submitDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      if (req.is('application/json') || req.body?.documentBase64) {
        throw new ValidationError('Document upload must be submitted as multipart/form-data with field name "file" or "document". JSON Base64 payloads are not supported.');
      }

      if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
        throw new ValidationError('No document file was uploaded. Please attach a valid file (PDF, JPEG, or PNG) via multipart/form-data with field name "file" or "document".');
      }

      const fileBuffer = req.file.buffer;
      const originalFilename = req.file.originalname || 'identity_document.pdf';
      const documentType = req.body?.documentType;

      const result = await this.service.submitDocument({
        studentUserId: req.user.id,
        fileBuffer,
        originalFilename,
        documentType,
      });

      res.status(201).json({
        success: true,
        message: 'Identity document submitted successfully for verification',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/student/verification/document/:id/url
   * Generates a temporary signed download URL for student's own identity document.
   */
  getDocumentUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const documentId = req.params.id as string;
      if (!documentId) {
        throw new ValidationError('Document ID parameter is required');
      }

      const result = await this.service.getStudentDocumentUrl(req.user.id, documentId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
