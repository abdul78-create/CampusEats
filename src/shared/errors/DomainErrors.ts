// CampusEats Standard Error Hierarchy

export abstract class DomainError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly errorCode: string;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends DomainError {
  public readonly statusCode = 400;
  public readonly errorCode = 'VALIDATION_FAILED';
  public readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
  }
}

export class UnauthorizedError extends DomainError {
  public readonly statusCode = 401;
  public readonly errorCode = 'UNAUTHORIZED';
}

export class ForbiddenError extends DomainError {
  public readonly statusCode = 403;
  public readonly errorCode = 'FORBIDDEN';
}

export class NotFoundError extends DomainError {
  public readonly statusCode = 404;
  public readonly errorCode = 'NOT_FOUND';
}

export class ConflictError extends DomainError {
  public readonly statusCode = 409;
  public readonly errorCode = 'CONFLICT';
}

export class InvalidStateTransitionError extends DomainError {
  public readonly statusCode = 400;
  public readonly errorCode = 'INVALID_STATE_TRANSITION';

  constructor(entity: string, fromState: string, toState: string) {
    super(`Cannot transition ${entity} from ${fromState} to ${toState}`);
  }
}

export class InfeasiblePickupTimeError extends DomainError {
  public readonly statusCode = 400;
  public readonly errorCode = 'PICKUP_TIME_UNAVAILABLE';
  public readonly requestedTime: string;
  public readonly nextAvailableTime: string;
  public readonly earliestFeasibleTime: Date;

  constructor(requestedTime: string, nextAvailableTime: string, message?: string) {
    super(message || `Requested pickup time ${requestedTime} is not feasible. Next available time is ${nextAvailableTime}`);
    this.requestedTime = requestedTime;
    this.nextAvailableTime = nextAvailableTime;
    this.earliestFeasibleTime = new Date(nextAvailableTime);
  }
}

export class UnverifiedStudentError extends DomainError {
  public readonly statusCode = 403;
  public readonly errorCode = 'UNVERIFIED_STUDENT';

  constructor(message = 'Student account must be verified and active to perform this action') {
    super(message);
  }
}
