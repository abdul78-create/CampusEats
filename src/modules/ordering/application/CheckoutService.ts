import * as crypto from 'crypto';
import { IOrderRepository } from '../domain/IOrderRepository.js';
import { IStallRepository } from '../../stall/domain/IStallRepository.js';
import { IInventoryRepository } from '../../stall/domain/IInventoryRepository.js';
import { IIdempotencyRepository } from '../../../shared/infrastructure/IIdempotencyRepository.js';
import { MasterOrderAggregate } from '../domain/MasterOrderAggregate.js';
import { SubOrderAggregate } from '../domain/SubOrderAggregate.js';
import { OrderItemSnapshot } from '../domain/OrderItemSnapshot.js';
import { OrderNumber } from '../domain/OrderNumber.js';
import { PickupSchedulingService } from '../../scheduling/domain/PickupSchedulingService.js';
import { StudentAccountStatus } from '../../identity/domain/IdentityEnums.js';
import { SubOrderStatus } from '../domain/OrderEnums.js';
import { StallOperatingPolicy } from '../../stall/domain/StallOperatingPolicy.js';
import { 
  UnverifiedStudentError, 
  ValidationError, 
  NotFoundError, 
  ConflictError,
  InfeasiblePickupTimeError
} from '../../../shared/errors/DomainErrors.js';

export interface CheckoutItemInput {
  menuItemId: string;
  name: string;
  price: number;
  preparationTimeMinutes: number;
  quantity: number;
}

export interface CheckoutStallCartInput {
  stallId: string;
  items: CheckoutItemInput[];
  requestedPickupTime?: Date | null;
}

export interface CheckoutRequest {
  idempotencyKey: string;
  studentId: string;
  studentAccountStatus: StudentAccountStatus;
  advancePercentage: number;
  stallCarts: CheckoutStallCartInput[];
}

export interface CheckoutResponse {
  masterOrderId: string;
  orderNumber: string;
  totalAmount: number;
  advanceAmount: number;
  remainingAmount: number;
  advancePercentage: number;
  subOrders: {
    subOrderId: string;
    subOrderNumber: string;
    stallId: string;
    subtotal: number;
    advanceAllocated: number;
    balanceDue: number;
    scheduledPickupTime: Date;
    earliestPickupTime: Date;
  }[];
}

export class CheckoutService {
  private readonly scheduler = new PickupSchedulingService();

  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly stallRepo: IStallRepository,
    private readonly inventoryRepo: IInventoryRepository,
    private readonly idempotencyRepo?: IIdempotencyRepository
  ) {}

  /**
   * Executes atomic multi-stall checkout.
   * If any item is out of stock, capacity exceeded, or any stall fails validation,
   * the entire checkout aborts cleanly and any reserved stock is released.
   */
  public async executeCheckout(request: CheckoutRequest): Promise<CheckoutResponse> {
    // 1. Idempotency Check & Payload Hash Validation
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({
      studentId: request.studentId,
      advancePercentage: request.advancePercentage,
      stallCarts: request.stallCarts,
    })).digest('hex');

    if (this.idempotencyRepo && request.idempotencyKey) {
      const existing = await this.idempotencyRepo.find(request.idempotencyKey);
      if (existing) {
        if (existing.requestHash && existing.requestHash !== requestHash && existing.requestHash !== request.idempotencyKey) {
          throw new ConflictError('Idempotency key already submitted with different request parameters');
        }
        if (existing.isCompleted && existing.responsePayload) {
          return existing.responsePayload as CheckoutResponse;
        }
      }

      // Claim idempotency record atomically to lock against concurrent duplicate execution
      try {
        await this.idempotencyRepo.save({
          key: request.idempotencyKey,
          targetAction: 'ORDER_CHECKOUT',
          requestHash,
          isCompleted: false,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        });
      } catch {
        // Another concurrent request claimed this idempotency key simultaneously.
        // Await the completion of the leading request.
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 50));
          const current = await this.idempotencyRepo.find(request.idempotencyKey);
          if (current?.isCompleted && current.responsePayload) {
            return current.responsePayload as CheckoutResponse;
          }
        }
        const finalCheck = await this.idempotencyRepo.find(request.idempotencyKey);
        if (finalCheck?.isCompleted && finalCheck.responsePayload) {
          return finalCheck.responsePayload as CheckoutResponse;
        }
        throw new ConflictError('Concurrent checkout request in progress for this idempotency key');
      }
    }

    // 2. Student Verification Gate
    if (request.studentAccountStatus !== StudentAccountStatus.ACTIVE) {
      throw new UnverifiedStudentError(
        `Cannot place order. Student account status is ${request.studentAccountStatus}. Only ACTIVE verified accounts can order.`
      );
    }

    if (!request.stallCarts || request.stallCarts.length === 0) {
      throw new ValidationError('Checkout requires at least one stall cart');
    }

    const masterOrderId = crypto.randomUUID();
    const masterOrderNumber = OrderNumber.generate('CE').getValue();
    const subOrders: SubOrderAggregate[] = [];
    const reservedItems: { menuItemId: string; quantity: number }[] = [];
    const scheduledDetails: { subOrderId: string; scheduledPickupTime: Date; earliestPickupTime: Date }[] = [];

    const currentTime = new Date();

    try {
      // 3. Process each stall cart
      let stallIndex = 1;
      for (const cart of request.stallCarts) {
        // Validate Stall State & Operating Hours
        const stall = await this.stallRepo.findById(cart.stallId);
        if (!stall) {
          throw new NotFoundError(`Stall ${cart.stallId} not found`);
        }
        stall.assertCanAcceptOrders(currentTime);

        // Check Stall Active Capacity Limits
        if (stall.capacity && typeof this.orderRepo.countActiveSubOrdersForStall === 'function') {
          const activeOrdersCount = await this.orderRepo.countActiveSubOrdersForStall(cart.stallId);
          if (activeOrdersCount >= stall.capacity.maxActiveOrders) {
            throw new ConflictError(
              `Stall "${stall.name}" has reached maximum kitchen capacity (${stall.capacity.maxActiveOrders} active orders). Please try again shortly.`
            );
          }
        }

        const subOrderId = crypto.randomUUID();
        const subOrderNumber = OrderNumber.generateSubOrderNumber(masterOrderNumber, stallIndex++);
        const itemSnapshots: OrderItemSnapshot[] = [];

        // Atomically reserve inventory for each item in this stall
        for (const item of cart.items) {
          await this.inventoryRepo.reserveStockAtomic(item.menuItemId, item.quantity);
          reservedItems.push({ menuItemId: item.menuItemId, quantity: item.quantity });

          const snapshot = new OrderItemSnapshot({
            id: crypto.randomUUID(),
            subOrderId,
            menuItemId: item.menuItemId,
            snapshotItemName: item.name,
            snapshotPrice: item.price,
            snapshotPrepMinutes: item.preparationTimeMinutes,
            quantity: item.quantity,
            totalPrice: Math.round(item.price * item.quantity * 100) / 100,
          });
          itemSnapshots.push(snapshot);
        }

        // Fetch active kitchen orders to compute queue backlog
        const activeSubOrders = await this.orderRepo.findSubOrdersByStallId(cart.stallId, [
          SubOrderStatus.CONFIRMED,
          SubOrderStatus.PREPARING,
        ]);
        const activeKitchenOrders = activeSubOrders.map(so => ({
          subOrderId: so.id,
          remainingPrepMinutes: so.items.reduce((max, it) => Math.max(max, it.snapshotPrepMinutes), 0) || 10,
        }));

        // Calculate pickup scheduling using LPT-based multiprocessor heuristic
        const scheduleResult = this.scheduler.calculateEarliestPickup({
          currentTime,
          itemPrepTimesMinutes: cart.items.map(i => i.preparationTimeMinutes),
          activeKitchenOrders,
          capacityModel: {
            parallelPreparationLimit: stall.capacity.parallelPreparationLimit,
            operationalBufferMinutes: stall.capacity.operationalBufferMinutes,
            maxActiveOrders: stall.capacity.maxActiveOrders,
          },
          requestedPickupTime: cart.requestedPickupTime,
        });

        // Feasibility check: Requested time must be on or after earliest feasible pickup
        if (cart.requestedPickupTime) {
          const reqDate = new Date(cart.requestedPickupTime);
          if (isNaN(reqDate.getTime())) {
            throw new ValidationError('Invalid requested pickup time format');
          }
          if (!scheduleResult.isFeasible) {
            throw new InfeasiblePickupTimeError(
              reqDate.toISOString(),
              scheduleResult.earliestFeasiblePickupTime.toISOString()
            );
          }
        }

        // Validate scheduled pickup time and earliest feasible prep completion against stall operating hours
        StallOperatingPolicy.assertPickupWithinOperatingHours({
          scheduledPickupTime: scheduleResult.scheduledPickupTime,
          earliestFeasibleTime: scheduleResult.earliestFeasiblePickupTime,
          prepTimeMinutes: scheduleResult.explanation.preparationTimeMinutes,
          operatingHours: stall.operatingHours,
          stallName: stall.name,
          isExplicitlyRequested: Boolean(cart.requestedPickupTime),
        });

        scheduledDetails.push({
          subOrderId,
          scheduledPickupTime: scheduleResult.scheduledPickupTime,
          earliestPickupTime: scheduleResult.earliestFeasiblePickupTime,
        });

        const subOrder = new SubOrderAggregate({
          id: subOrderId,
          masterOrderId,
          stallId: cart.stallId,
          subOrderNumber,
          items: itemSnapshots,
          pickupSchedule: {
            requestedPickupTime: cart.requestedPickupTime ? new Date(cart.requestedPickupTime) : scheduleResult.scheduledPickupTime,
            scheduledPickupTime: scheduleResult.scheduledPickupTime,
            earliestFeasiblePickupTime: scheduleResult.earliestFeasiblePickupTime,
            preparationTimeMinutes: scheduleResult.explanation.preparationTimeMinutes,
            queueDelayMinutes: scheduleResult.explanation.queueDelayMinutes,
            operationalBufferMinutes: scheduleResult.explanation.operationalBufferMinutes,
            capacityConstraintApplied: scheduleResult.explanation.capacityConstraintApplied,
          },
        });

        subOrders.push(subOrder);
      }

      // 4. Construct MasterOrder aggregate (enforces multi-stall rules & penny-perfect allocation)
      const masterOrder = new MasterOrderAggregate({
        id: masterOrderId,
        studentId: request.studentId,
        orderNumber: masterOrderNumber,
        advancePercentage: request.advancePercentage,
        subOrders,
      });

      // 5. Persist Master Order and decomposed SubOrders atomically
      await this.orderRepo.saveMasterOrder(masterOrder);

      const response: CheckoutResponse = {
        masterOrderId: masterOrder.id,
        orderNumber: masterOrder.orderNumber,
        totalAmount: masterOrder.totalAmount,
        advanceAmount: masterOrder.advanceAmount,
        remainingAmount: masterOrder.remainingAmount,
        advancePercentage: masterOrder.advancePercentage,
        subOrders: masterOrder.subOrders.map(so => {
          const sched = scheduledDetails.find(s => s.subOrderId === so.id)!;
          return {
            subOrderId: so.id,
            subOrderNumber: so.subOrderNumber,
            stallId: so.stallId,
            subtotal: so.subtotalAmount,
            advanceAllocated: so.advancePaidAmount,
            balanceDue: so.balanceDueAmount,
            scheduledPickupTime: sched.scheduledPickupTime,
            earliestPickupTime: sched.earliestPickupTime,
          };
        }),
      };

      // 6. Complete Idempotency record with exact requestHash
      if (this.idempotencyRepo && request.idempotencyKey) {
        await this.idempotencyRepo.complete(request.idempotencyKey, response, 201, requestHash);
      }

      // 7. Record Notification for Student
      if (typeof this.orderRepo.createNotification === 'function') {
        try {
          await this.orderRepo.createNotification({
            userId: request.studentId,
            type: 'ORDER_STATUS',
            title: 'Order Placed Successfully',
            message: `Your master order #${masterOrder.orderNumber} comprising ${masterOrder.subOrders.length} stall(s) has been placed.`,
            payload: {
              masterOrderId: masterOrder.id,
              orderNumber: masterOrder.orderNumber,
              totalAmount: masterOrder.totalAmount,
              advanceAmount: masterOrder.advanceAmount,
            },
          });
        } catch {
          // Non-blocking notification delivery
        }
      }

      return response;
    } catch (error) {
      // Clean up in-flight idempotency record so user can retry
      if (this.idempotencyRepo && request.idempotencyKey && typeof this.idempotencyRepo.delete === 'function') {
        try {
          await this.idempotencyRepo.delete(request.idempotencyKey);
        } catch {
          // Ignore delete failure
        }
      }

      // 8. Atomic Rollback: release any inventory that was reserved before the failure
      for (const res of reservedItems) {
        try {
          await this.inventoryRepo.releaseStockAtomic(res.menuItemId, res.quantity);
        } catch {
          // Continue rollback
        }
      }
      throw error;
    }
  }
}
