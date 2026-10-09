import { PickupSchedulingService } from '../../../src/modules/scheduling/domain/PickupSchedulingService.js';

describe('PickupSchedulingService Capacity & Queue Engine', () => {
  const scheduler = new PickupSchedulingService();
  const fixedNow = new Date('2026-09-24T12:35:00.000Z');

  test('calculates earliest pickup on empty kitchen with buffer', () => {
    // Current time: 12:35
    // Samosa prep: 10 mins
    // Operational buffer: 2 mins
    // Expected earliest feasible: 12:47
    const result = scheduler.calculateEarliestPickup({
      currentTime: fixedNow,
      itemPrepTimesMinutes: [10],
      activeKitchenOrders: [],
      capacityModel: {
        parallelPreparationLimit: 4,
        operationalBufferMinutes: 2,
        maxActiveOrders: 20,
      },
    });

    expect(result.isFeasible).toBe(true);
    expect(result.earliestFeasiblePickupTime).toEqual(new Date('2026-09-24T12:47:00.000Z'));
    expect(result.explanation.preparationTimeMinutes).toBe(10);
    expect(result.explanation.queueDelayMinutes).toBe(0);
    expect(result.explanation.operationalBufferMinutes).toBe(2);
  });

  test('proves parallel kitchen stations reason about capacity (Samosa 10m + Dosa 8m on 2 stations = 10m prep, not 18m)', () => {
    // Samosa = 10 min, Dosa = 8 min
    // 2 parallel stations
    // Station 1: 10 min (Samosa)
    // Station 2: 8 min (Dosa)
    // Makespan prep time = max(10, 8) = 10 mins (NOT 10 + 8 = 18 mins)
    const prepDuration2Stations = PickupSchedulingService.calculateParallelPreparationTime([10, 8], 2);
    expect(prepDuration2Stations).toBe(10);

    // If constrained to only 1 station, it must execute sequentially: 10 + 8 = 18 mins
    const prepDuration1Station = PickupSchedulingService.calculateParallelPreparationTime([10, 8], 1);
    expect(prepDuration1Station).toBe(18);

    // Full earliest pickup verification with 2 stations, 0 queue, 2 buffer
    // Expected earliest: 12:35 + 10 (prep) + 0 (queue) + 2 (buffer) = 12:47
    const result = scheduler.calculateEarliestPickup({
      currentTime: fixedNow,
      itemPrepTimesMinutes: [10, 8],
      activeKitchenOrders: [],
      capacityModel: {
        parallelPreparationLimit: 2,
        operationalBufferMinutes: 2,
        maxActiveOrders: 20,
      },
    });

    expect(result.explanation.preparationTimeMinutes).toBe(10);
    expect(result.earliestFeasiblePickupTime).toEqual(new Date('2026-09-24T12:47:00.000Z'));
  });

  test('correctly adds queue delay across parallel cooking lines', () => {
    // Current time: 12:35
    // Candidate order prep: 8 mins
    // Active orders: 4 orders with 8 mins remaining each = 32 total minutes
    // Parallel lines: 4 -> queue delay = ceil(32 / 4) = 8 mins
    // Operational buffer: 2 mins
    // Total wait: 8 (prep) + 8 (queue) + 2 (buffer) = 18 mins
    // Expected earliest: 12:35 + 18 mins = 12:53
    const result = scheduler.calculateEarliestPickup({
      currentTime: fixedNow,
      itemPrepTimesMinutes: [8],
      activeKitchenOrders: [
        { subOrderId: 'sub_1', remainingPrepMinutes: 8 },
        { subOrderId: 'sub_2', remainingPrepMinutes: 8 },
        { subOrderId: 'sub_3', remainingPrepMinutes: 8 },
        { subOrderId: 'sub_4', remainingPrepMinutes: 8 },
      ],
      capacityModel: {
        parallelPreparationLimit: 4,
        operationalBufferMinutes: 2,
        maxActiveOrders: 20,
      },
    });

    expect(result.earliestFeasiblePickupTime).toEqual(new Date('2026-09-24T12:53:00.000Z'));
    expect(result.explanation.queueDelayMinutes).toBe(8);
  });

  test('detects infeasible requested pickup times and provides explanation', () => {
    // Earliest feasible is 12:47
    // Student requests 12:40 (too early)
    const tooEarlyTime = new Date('2026-09-24T12:40:00.000Z');

    const result = scheduler.calculateEarliestPickup({
      currentTime: fixedNow,
      itemPrepTimesMinutes: [10],
      activeKitchenOrders: [],
      capacityModel: {
        parallelPreparationLimit: 4,
        operationalBufferMinutes: 2,
        maxActiveOrders: 20,
      },
      requestedPickupTime: tooEarlyTime,
    });

    expect(result.isFeasible).toBe(false);
    expect(result.earliestFeasiblePickupTime).toEqual(new Date('2026-09-24T12:47:00.000Z'));
  });

  test('recomputes dynamic schedule shifts when kitchen surge occurs', () => {
    const scheduledOrders = [
      { subOrderId: 'sub_101', originalPickupTime: new Date('2026-09-24T12:50:00.000Z'), prepMinutes: 10 },
      { subOrderId: 'sub_102', originalPickupTime: new Date('2026-09-24T12:55:00.000Z'), prepMinutes: 12 },
    ];

    const shifted = scheduler.recomputeForQueueSurge({
      scheduledOrders,
      additionalQueueDelayMinutes: 15,
      currentTime: fixedNow,
    });

    expect(shifted).toHaveLength(2);
    expect(shifted[0].shiftedPickup).toEqual(new Date('2026-09-24T13:05:00.000Z'));
    expect(shifted[0].varianceMinutes).toBe(15);
  });
});
