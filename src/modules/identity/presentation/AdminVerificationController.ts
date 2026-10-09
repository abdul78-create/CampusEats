import { Request, Response, NextFunction } from 'express';
import { StudentVerificationService } from '../application/StudentVerificationService.js';
import { VerificationStatus, VerificationRejectionReason } from '../domain/IdentityEnums.js';
import { ValidationError, UnauthorizedError } from '../../../shared/errors/DomainErrors.js';

export class AdminVerificationController {
  constructor(private readonly service: StudentVerificationService) {}

  /**
   * GET /api/v1/admin/verifications
   * Paginated verification review queue for administrators.
   */
  getQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const status = req.query.status as VerificationStatus | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await this.service.getAdminVerificationQueue({
        status,
        page,
        limit,
      });

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/admin/verifications/:id/document/url
   * Generates a temporary signed URL for an administrator to review the student identity document.
   */
  getDocumentUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const verificationId = req.params.id as string;
      if (!verificationId) {
        throw new ValidationError('Verification ID parameter is required');
      }

      const result = await this.service.getAdminDocumentUrl(req.user.id, verificationId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/admin/verifications/:id/approve
   * Approves student verification and transitions account to ACTIVE.
   */
  approve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const verificationId = req.params.id as string;
      if (!verificationId) {
        throw new ValidationError('Verification ID parameter is required');
      }

      const result = await this.service.approveVerification(req.user.id, verificationId);
      res.status(200).json({
        success: true,
        message: 'Student verification approved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/admin/verifications/:id/reject
   * Rejects student verification with a mandatory structured reason code.
   */
  reject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const verificationId = req.params.id as string;
      if (!verificationId) {
        throw new ValidationError('Verification ID parameter is required');
      }

      const reasonCode = req.body?.reasonCode as VerificationRejectionReason;
      if (!reasonCode) {
        throw new ValidationError('Rejection reason code is required (e.g. INVALID_DOCUMENT, DOCUMENT_UNREADABLE, IDENTITY_MISMATCH)');
      }

      const notes = req.body?.notes;

      const result = await this.service.rejectVerification(req.user.id, verificationId, reasonCode, notes);
      res.status(200).json({
        success: true,
        message: 'Student verification rejected',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/admin/students/:id/suspend
   * Administratively suspends a student account and freezes ordering eligibility.
   */
  suspendStudent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const studentUserId = req.params.id as string;
      if (!studentUserId) {
        throw new ValidationError('Student User ID parameter is required');
      }

      const reason = req.body?.reason || 'Administrative policy violation';

      await this.service.suspendStudent(req.user.id, studentUserId, reason);
      res.status(200).json({
        success: true,
        message: 'Student account has been administratively suspended',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/admin/students/:id/reactivate
   * Reactivates an administratively suspended student account.
   */
  reactivateStudent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const studentUserId = req.params.id as string;
      if (!studentUserId) {
        throw new ValidationError('Student User ID parameter is required');
      }

      await this.service.reactivateStudent(req.user.id, studentUserId);
      res.status(200).json({
        success: true,
        message: 'Student account has been reactivated successfully',
      });
    } catch (error) {
      next(error);
    }
  };
}
