import { Request, Response, NextFunction } from 'express';
import { LivenessVerificationService } from '../application/LivenessVerificationService.js';
import { UserRole } from '../domain/IdentityEnums.js';
import { ValidationError, UnauthorizedError, ForbiddenError } from '../../../shared/errors/DomainErrors.js';

export class LivenessVerificationController {
  constructor(private readonly service: LivenessVerificationService) {}

  /**
   * POST /api/v1/students/verification/liveness/session
   * Initiates a new liveness challenge session.
   */
  createSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const session = await this.service.createSession(req.user.id);
      res.status(201).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          sessionNonce: session.sessionNonce,
          challengeSequence: session.challengeSequence,
          challengeParams: session.challengeParams,
          expiresAt: session.expiresAt.toISOString(),
          ttlSeconds: session.ttlSeconds,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/students/verification/liveness/verify
   * Submits temporal video evidence for liveness challenge verification.
   */
  verifyLiveness = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const file = req.file;
      if (!file || !file.buffer) {
        throw new ValidationError('Evidence video file is required under field name "evidence", "video", or "file"');
      }

      const sessionId = req.body?.sessionId;
      const sessionNonce = req.body?.sessionNonce;

      if (!sessionId || typeof sessionId !== 'string') {
        throw new ValidationError('Valid sessionId string is required');
      }

      if (!sessionNonce || typeof sessionNonce !== 'string') {
        throw new ValidationError('Valid sessionNonce string is required');
      }

      // Prohibit client gesture assertions
      if (
        req.body?.naturalBlinkObserved !== undefined ||
        req.body?.headTurnLeftObserved !== undefined ||
        req.body?.headTurnRightObserved !== undefined ||
        req.body?.clientTimestamps !== undefined ||
        req.body?.gestureTimestampsMs !== undefined
      ) {
        throw new ValidationError('Client-asserted gesture observations are strictly prohibited');
      }

      const result = await this.service.verifyLiveness({
        studentUserId: req.user.id,
        sessionId,
        sessionNonce,
        fileBuffer: file.buffer,
        originalFilename: file.originalname || 'liveness.webm',
      });

      res.status(200).json({
        success: true,
        data: {
          isVerified: true,
          decision: result.decision,
          confidenceScore: result.confidenceScore,
          challengesCompleted: result.detectedSequence,
          verifiedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/students/verification/liveness/status
   * Retrieves current liveness verification status for student.
   */
  getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const status = await this.service.getStatus(req.user.id);
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/admin/verifications/:id/liveness
   * Admin inspection of liveness verification record and signed evidence URL.
   */
  getAdminLiveness = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const role = req.user.role;
      if (role !== UserRole.ADMIN && (role as string) !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Unauthorized: Administrator access required to inspect liveness records');
      }

      const verificationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const details = await this.service.getAdminLivenessDetails(verificationId, req.user.id);
      res.status(200).json({
        success: true,
        data: details,
      });
    } catch (error) {
      next(error);
    }
  };
}
