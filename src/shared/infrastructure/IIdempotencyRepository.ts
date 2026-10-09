export interface IdempotencyRecordProps {
  key: string;
  targetAction: string;
  requestHash: string;
  responsePayload?: unknown;
  statusCode?: number | null;
  isCompleted: boolean;
  expiresAt: Date;
  createdAt: Date;
}

export interface IIdempotencyRepository {
  find(key: string): Promise<IdempotencyRecordProps | null>;
  save(record: IdempotencyRecordProps): Promise<void>;
  complete(key: string, responsePayload: unknown, statusCode: number, requestHash?: string): Promise<void>;
  delete?(key: string): Promise<void>;
}
