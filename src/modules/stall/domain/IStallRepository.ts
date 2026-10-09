import { StallAggregate } from './StallAggregate.js';

export interface IStallRepository {
  save(stall: StallAggregate): Promise<void>;
  findById(id: string): Promise<StallAggregate | null>;
  findByOwnerId(ownerId: string): Promise<StallAggregate[]>;
  findAllApproved(): Promise<StallAggregate[]>;
}
