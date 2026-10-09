export interface SchedulingExplanation {
  preparationTimeMinutes: number;
  queueDelayMinutes: number;
  operationalBufferMinutes: number;
  capacityConstraintApplied: boolean;
  earliestFeasibleTime: Date;
  calculatedAt: Date;
}

export interface ActiveKitchenOrder {
  subOrderId: string;
  remainingPrepMinutes: number;
}

export interface KitchenCapacityModel {
  parallelPreparationLimit: number;
  operationalBufferMinutes: number;
  maxActiveOrders: number;
}

export interface SchedulingCalculationInput {
  currentTime: Date;
  itemPrepTimesMinutes: number[];
  activeKitchenOrders: ActiveKitchenOrder[];
  capacityModel: KitchenCapacityModel;
  requestedPickupTime?: Date | null;
}

export interface SchedulingCalculationResult {
  isFeasible: boolean;
  scheduledPickupTime: Date;
  earliestFeasiblePickupTime: Date;
  explanation: SchedulingExplanation;
}
