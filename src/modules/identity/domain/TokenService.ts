import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from './IdentityEnums.js';
import { UnauthorizedError } from '../../../shared/errors/DomainErrors.js';

export interface TokenPayload {
  userId: string;
  role: UserRole;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
}

/**
 * TokenService
 *
 * Implements HMAC-signed JWT Bearer tokens for stateless authorization
 * combined with server-side SHA-256 fingerprinted RefreshSessions in PostgreSQL.
 */
export class TokenService {
  private static readonly BCRYPT_ROUNDS = 12;
  private static readonly ACCESS_TOKEN_EXPIRY = '15m';
  private static readonly REFRESH_TOKEN_EXPIRY = '7d';

  private static getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be configured with at least 32 characters in production');
      }
      return 'development_fallback_jwt_secret_min_32_characters_long_key';
    }
    return secret;
  }

  private static getRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret || secret.length < 32) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_REFRESH_SECRET must be configured with at least 32 characters in production');
      }
      return 'development_fallback_refresh_jwt_secret_min_32_chars';
    }
    return secret;
  }

  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  public static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Computes a deterministic SHA-256 fingerprint of a token.
   * Plaintext refresh tokens are never persisted to PostgreSQL.
   */
  public static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generates HMAC-signed access and refresh tokens.
   * A cryptographic random jti is embedded in every refresh token ensuring unique hash fingerprints.
   */
  public static generateTokens(payload: TokenPayload): AuthTokens {
    const secret = this.getJwtSecret();
    const refreshSecret = this.getRefreshSecret();

    const accessToken = jwt.sign(
      {
        userId: payload.userId,
        role: payload.role,
        email: payload.email,
      },
      secret,
      { expiresIn: this.ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
      {
        userId: payload.userId,
        jti: crypto.randomUUID(),
      },
      refreshSecret,
      { expiresIn: this.REFRESH_TOKEN_EXPIRY }
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresInSeconds: 15 * 60, // 15 minutes
    };
  }

  public static verifyAccessToken(token: string): TokenPayload {
    try {
      const secret = this.getJwtSecret();
      const decoded = jwt.verify(token, secret) as TokenPayload & jwt.JwtPayload;
      return {
        userId: decoded.userId,
        role: decoded.role,
        email: decoded.email,
      };
    } catch {
      throw new UnauthorizedError('Invalid or expired authentication token');
    }
  }

  public static verifyRefreshToken(token: string): { userId: string } {
    try {
      const secret = this.getRefreshSecret();
      const decoded = jwt.verify(token, secret) as { userId: string } & jwt.JwtPayload;
      return {
        userId: decoded.userId,
      };
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }
}
