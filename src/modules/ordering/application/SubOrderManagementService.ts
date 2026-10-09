import { IOrderRepository } from '../domain/IOrderRepository.js';
import { 
  ResourceScopeAuthorizer, 
  AuthenticatedUserContext 
} from '../../../shared/security/ResourceScopeAuthorizer.js';
import { StaffPermissionType } from '../../stall/domain/StallEnums.js';
import { NotFoundError } from '../../../shared/errors/DomainErrors.js';

export class SubOrderManagementService {
  constructor(private readonly orderRepo: IOrderRepository) {}

  /**
   * Stall operator confirms sub-order for kitchen preparation.
   */
  async confirmOrder(user: AuthenticatedUserContext, subOrderId: string): Promise<void> {
    const subOrder = await this.orderRepo.findSubOrderById(subOrderId);
    if (!subOrder) throw new NotFoundError(`SubOrder ${subOrderId} not found`);

    ResourceScopeAuthorizer.assertStallScope(
      user, 
      subOrder.stallId, 
      StaffPermissionType.MANAGE_ORDERS, 
      'confirm sub-order'
    );

    subOrder.confirm();
    await this.orderRepo.saveSubOrder(subOrder);
  }

  /**
   * Stall kitchen begins cooking dishes.
   */
  async startPreparing(user: AuthenticatedUserContext, subOrderId: string): Promise<void> {
    const subOrder = await this.orderRepo.findSubOrderById(subOrderId);
    if (!subOrder) throw new NotFoundError(`SubOrder ${subOrderId} not found`);

    ResourceScopeAuthorizer.assertStallScope(
      user, 
      subOrder.stallId, 
      StaffPermissionType.MANAGE_ORDERS, 
      'start preparing sub-order'
    );

    subOrder.startPreparing();
    await this.orderRepo.saveSubOrder(subOrder);
  }

  /**
   * Kitchen completes preparation; food placed in pickup bay.
   */
  async markReady(
    user: AuthenticatedUserContext, 
    subOrderId: string, 
    gracePeriodMinutes = 15
  ): Promise<void> {
    const subOrder = await this.orderRepo.findSubOrderById(subOrderId);
    if (!subOrder) throw new NotFoundError(`SubOrder ${subOrderId} not found`);

    ResourceScopeAuthorizer.assertStallScope(
      user, 
      subOrder.stallId, 
      StaffPermissionType.MANAGE_ORDERS, 
      'mark sub-order READY'
    );

    const expiresAt = new Date(Date.now() + gracePeriodMinutes * 60 * 1000);
    subOrder.markReady(expiresAt);
    await this.orderRepo.saveSubOrder(subOrder);
  }

  /**
   * Authorized staff records in-person cash or counter UPI balance payment.
   * Students cannot self-declare payment.
   */
  async recordCounterBalancePayment(
    user: AuthenticatedUserContext, 
    subOrderId: string
  ): Promise<void> {
    const subOrder = await this.orderRepo.findSubOrderById(subOrderId);
    if (!subOrder) throw new NotFoundError(`SubOrder ${subOrderId} not found`);

    ResourceScopeAuthorizer.assertCanRecordCounterPayment(user, subOrder.stallId);

    subOrder.settleBalance();
    await this.orderRepo.saveSubOrder(subOrder);
  }

  /**
   * Authorized staff verifies student pass, verifies balance is settled, and hands over food.
   * Students can NEVER call this.
   */
  async confirmPickupCollection(
    user: AuthenticatedUserContext, 
    subOrderId: string
  ): Promise<void> {
    const subOrder = await this.orderRepo.findSubOrderById(subOrderId);
    if (!subOrder) throw new NotFoundError(`SubOrder ${subOrderId} not found`);

    ResourceScopeAuthorizer.assertCanMarkOrderCollected(user, subOrder.stallId);

    subOrder.markCollected();
    await this.orderRepo.saveSubOrder(subOrder);
  }

  /**
   * Stall operator rejects order (triggers refund eligibility).
   */
  async rejectOrder(
    user: AuthenticatedUserContext, 
    subOrderId: string, 
    reason: string
  ): Promise<void> {
    const subOrder = await this.orderRepo.findSubOrderById(subOrderId);
    if (!subOrder) throw new NotFoundError(`SubOrder ${subOrderId} not found`);

    ResourceScopeAuthorizer.assertStallScope(
      user, 
      subOrder.stallId, 
      StaffPermissionType.MANAGE_ORDERS, 
      'reject sub-order'
    );

    subOrder.reject(reason);
    await this.orderRepo.saveSubOrder(subOrder);
  }
}
