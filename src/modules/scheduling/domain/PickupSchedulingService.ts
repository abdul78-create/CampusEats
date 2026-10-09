import { 
  SchedulingCalculationInput, 
  SchedulingCalculationResult, 
  SchedulingExplanation 
} from './SchedulingInterfaces.js';

export class PickupSchedulingService {
  /**
   * Computes the makespan for preparing an assortment of dishes across parallel kitchen stations
   * using the Longest Processing Time (LPT) multiprocessor scheduling algorithm.
   */
  public static calculateParallelPreparationTime(itemPrepTimes: number[], parallelStations: number): number {
    if (itemPrepTimes.length === 0) return 0;
    const stations = Math.max(1, parallelStations);

    if (stations === 1) {
      // Single station forces purely sequential preparation
      return itemPrepTimes.reduce((sum, t) => sum + t, 0);
    }

    // Sort descending to assign largest cooking commitments first
    const sorted = [...itemPrepTimes].sort((a, b) => b - a);
    const stationLoads: number[] = new Array(stations).fill(0);

    for (const prepTime of sorted) {
      // Assign item to the station that becomes available earliest
      let minStationIndex = 0;
      for (let i = 1; i < stations; i++) {
        if (stationLoads[i] < stationLoads[minStationIndex]) {
          minStationIndex = i;
        }
      }
      stationLoads[minStationIndex] += prepTime;
    }

    return Math.max(...stationLoads);
  }

  /**
   * Calculates realistic earliest pickup time and verifies requested pickup feasibility.
   * Accounts for parallel station makespan, queue backlog, and operational buffers.
   */
  public calculateEarliestPickup(input: SchedulingCalculationInput): SchedulingCalculationResult {
    const { 
      currentTime, 
      itemPrepTimesMinutes, 
      activeKitchenOrders, 
      capacityModel, 
      requestedPickupTime 
    } = input;

    const parallelStations = Math.max(1, capacityModel.parallelPreparationLimit || 4);

    // 1. Preparation Time Workload via parallel station allocation
    const preparationTimeMinutes = itemPrepTimesMinutes.length > 0 
      ? PickupSchedulingService.calculateParallelPreparationTime(itemPrepTimesMinutes, parallelStations)
      : 5;

    // 2. Queue Delay Calculation across parallel cooking lines
    const totalRemainingQueuePrepMinutes = activeKitchenOrders.reduce(
      (sum, order) => sum + Math.max(0, order.remainingPrepMinutes), 
      0
    );

    const queueDelayMinutes = Math.ceil(totalRemainingQueuePrepMinutes / parallelStations);
    const operationalBufferMinutes = Math.max(0, capacityModel.operationalBufferMinutes || 2);

    // 3. Earliest Feasible Pickup calculation
    const totalWaitMinutes = preparationTimeMinutes + queueDelayMinutes + operationalBufferMinutes;
    const earliestFeasibleTime = new Date(currentTime.getTime() + totalWaitMinutes * 60 * 1000);

    const explanation: SchedulingExplanation = {
      preparationTimeMinutes,
      queueDelayMinutes,
      operationalBufferMinutes,
      capacityConstraintApplied: parallelStations < activeKitchenOrders.length,
      earliestFeasibleTime,
      calculatedAt: currentTime,
    };

    // 4. Feasibility check against requested pickup
    if (!requestedPickupTime) {
      return {
        isFeasible: true,
        scheduledPickupTime: earliestFeasibleTime,
        earliestFeasiblePickupTime: earliestFeasibleTime,
        explanation,
      };
    }

    const isFeasible = requestedPickupTime.getTime() >= earliestFeasibleTime.getTime();

    return {
      isFeasible,
      scheduledPickupTime: isFeasible ? requestedPickupTime : earliestFeasibleTime,
      earliestFeasiblePickupTime: earliestFeasibleTime,
      explanation,
    };
  }

  /**
   * Recomputes pickup schedules for future orders when a sudden queue surge occurs.
   */
  public recomputeForQueueSurge(params: {
    scheduledOrders: { subOrderId: string; originalPickupTime: Date; prepMinutes: number }[];
    additionalQueueDelayMinutes: number;
    currentTime: Date;
  }): { subOrderId: string; originalPickup: Date; shiftedPickup: Date; varianceMinutes: number }[] {
    const results = [];

    for (const order of params.scheduledOrders) {
      const shiftedPickup = new Date(
        order.originalPickupTime.getTime() + params.additionalQueueDelayMinutes * 60 * 1000
      );
      const varianceMinutes = Math.round(
        (shiftedPickup.getTime() - order.originalPickupTime.getTime()) / (60 * 1000)
      );

      results.push({
        subOrderId: order.subOrderId,
        originalPickup: order.originalPickupTime,
        shiftedPickup,
        varianceMinutes,
      });
    }

    return results;
  }
}
