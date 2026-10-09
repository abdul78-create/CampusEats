import { ValidationError, InfeasiblePickupTimeError } from '../../../shared/errors/DomainErrors.js';
import { StallStatus } from './StallEnums.js';
import { StallOperatingHourProps } from './StallInterfaces.js';

export class StallOperatingPolicy {
  /**
   * Evaluates if a given time falls within the configured weekly operating hours.
   */
  public static isWithinOperatingHours(
    time: Date, 
    operatingHours: StallOperatingHourProps[]
  ): boolean {
    if (!operatingHours || operatingHours.length === 0) {
      return false;
    }

    const dayOfWeek = time.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
    const daySchedule = operatingHours.find(h => h.dayOfWeek === dayOfWeek);

    if (!daySchedule || daySchedule.isClosed) {
      return false;
    }

    const currentMinutes = time.getUTCHours() * 60 + time.getUTCMinutes();
    const [openH, openM] = daySchedule.openTime.split(':').map(Number);
    const [closeH, closeM] = daySchedule.closeTime.split(':').map(Number);

    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  }

  /**
   * Finds the next upcoming operating window after a given reference time.
   */
  public static getNextOperatingWindow(
    fromTime: Date,
    operatingHours: StallOperatingHourProps[]
  ): { nextOpenTime: Date; openTimeString: string; closeTimeString: string } | null {
    if (!operatingHours || operatingHours.length === 0) {
      return null;
    }

    for (let offsetDays = 0; offsetDays <= 7; offsetDays++) {
      const candidateDate = new Date(fromTime.getTime() + offsetDays * 24 * 60 * 60 * 1000);
      const dayOfWeek = candidateDate.getUTCDay();
      const schedule = operatingHours.find(h => h.dayOfWeek === dayOfWeek);

      if (schedule && !schedule.isClosed) {
        const [openH, openM] = schedule.openTime.split(':').map(Number);
        const nextOpenTime = new Date(Date.UTC(
          candidateDate.getUTCFullYear(),
          candidateDate.getUTCMonth(),
          candidateDate.getUTCDate(),
          openH,
          openM,
          0,
          0
        ));

        if (nextOpenTime.getTime() > fromTime.getTime()) {
          return {
            nextOpenTime,
            openTimeString: schedule.openTime,
            closeTimeString: schedule.closeTime,
          };
        }
      }
    }

    return null;
  }

  /**
   * Asserts whether an owner can transition the stall to OPEN at the current time.
   * Stalls cannot open outside officially configured operating hours.
   */
  public static assertCanTransitionLiveStatus(params: {
    targetStatus: StallStatus;
    currentTime: Date;
    operatingHours: StallOperatingHourProps[];
  }): void {
    if (params.targetStatus === StallStatus.OPEN || params.targetStatus === StallStatus.BUSY) {
      const isAllowedTime = this.isWithinOperatingHours(params.currentTime, params.operatingHours);
      if (!isAllowedTime) {
        throw new ValidationError(
          `Cannot transition stall to ${params.targetStatus} outside officially configured operating hours.`
        );
      }
    }
  }

  /**
   * Asserts whether a stall is currently accepting orders.
   * Requires BOTH within operating hours AND liveStatus === OPEN.
   */
  public static assertCanAcceptNewOrders(params: {
    liveStatus: StallStatus;
    currentTime: Date;
    operatingHours: StallOperatingHourProps[];
  }): void {
    if (!this.isWithinOperatingHours(params.currentTime, params.operatingHours)) {
      throw new ValidationError('Stall is currently outside official campus operating hours');
    }

    if (params.liveStatus === StallStatus.CLOSED) {
      throw new ValidationError('Stall counter is currently CLOSED');
    }

    if (params.liveStatus === StallStatus.TEMPORARILY_PAUSED) {
      throw new ValidationError('Stall is TEMPORARILY_PAUSED to clear existing kitchen backlog');
    }
  }

  /**
   * Validates pickup scheduling against stall operating hours.
   * Handles edge cases:
   * 1. Requested time after closing time.
   * 2. Preparation crossing closing time.
   * 3. Next operating window calculation for nextAvailableTime.
   */
  public static assertPickupWithinOperatingHours(params: {
    scheduledPickupTime: Date;
    earliestFeasibleTime: Date;
    prepTimeMinutes: number;
    operatingHours: StallOperatingHourProps[];
    stallName: string;
    isExplicitlyRequested?: boolean;
  }): void {
    const { 
      scheduledPickupTime, 
      earliestFeasibleTime, 
      prepTimeMinutes, 
      operatingHours, 
      stallName,
      isExplicitlyRequested 
    } = params;

    if (!operatingHours || operatingHours.length === 0) {
      return;
    }

    const dayOfWeek = scheduledPickupTime.getUTCDay();
    const daySchedule = operatingHours.find(h => h.dayOfWeek === dayOfWeek);

    const nextWindow = this.getNextOperatingWindow(scheduledPickupTime, operatingHours);
    const nextAvailableTime = nextWindow 
      ? new Date(nextWindow.nextOpenTime.getTime() + prepTimeMinutes * 60 * 1000)
      : earliestFeasibleTime;

    // Case 1: Stall is closed on the scheduled day
    if (!daySchedule || daySchedule.isClosed) {
      throw new InfeasiblePickupTimeError(
        scheduledPickupTime.toISOString(),
        nextAvailableTime.toISOString(),
        `Stall "${stallName}" is closed on this day. Next opening window is ${nextWindow?.openTimeString || 'not configured'}.`
      );
    }

    const scheduledMinutes = scheduledPickupTime.getUTCHours() * 60 + scheduledPickupTime.getUTCMinutes();
    const earliestMinutes = earliestFeasibleTime.getUTCHours() * 60 + earliestFeasibleTime.getUTCMinutes();
    const [openH, openM] = daySchedule.openTime.split(':').map(Number);
    const [closeH, closeM] = daySchedule.closeTime.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    // Case 2: Scheduled pickup time is after closing
    if (scheduledMinutes > closeMinutes) {
      throw new InfeasiblePickupTimeError(
        scheduledPickupTime.toISOString(),
        nextAvailableTime.toISOString(),
        `Requested pickup time (${String(scheduledPickupTime.getUTCHours()).padStart(2, '0')}:${String(scheduledPickupTime.getUTCMinutes()).padStart(2, '0')} UTC) is after stall closing time (${daySchedule.closeTime} UTC) for "${stallName}".`
      );
    }

    // Case 3: Scheduled pickup time is before opening
    if (scheduledMinutes < openMinutes) {
      throw new InfeasiblePickupTimeError(
        scheduledPickupTime.toISOString(),
        nextAvailableTime.toISOString(),
        `Requested pickup time is before stall opening time (${daySchedule.openTime} UTC) for "${stallName}".`
      );
    }

    // Case 4: Preparation time crosses closing time
    // Even if requested time or current time is within hours, if earliestFeasibleTime exceeds closing time,
    // the kitchen cannot finish cooking before the stall closes!
    if (earliestMinutes > closeMinutes && earliestFeasibleTime.getUTCDate() === scheduledPickupTime.getUTCDate()) {
      throw new InfeasiblePickupTimeError(
        (isExplicitlyRequested ? scheduledPickupTime : earliestFeasibleTime).toISOString(),
        nextAvailableTime.toISOString(),
        `Preparation for stall "${stallName}" requires ${prepTimeMinutes}m which would complete after stall closing time (${daySchedule.closeTime} UTC). Order cannot be fulfilled before closing.`
      );
    }
  }
}

