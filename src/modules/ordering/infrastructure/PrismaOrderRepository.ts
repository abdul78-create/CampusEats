import * as crypto from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { IOrderRepository } from '../domain/IOrderRepository.js';
import { MasterOrderAggregate } from '../domain/MasterOrderAggregate.js';
import { SubOrderAggregate } from '../domain/SubOrderAggregate.js';
import { OrderItemSnapshot } from '../domain/OrderItemSnapshot.js';
import { MasterOrderStatus, SubOrderStatus } from '../domain/OrderEnums.js';
import { OrderStateValidator } from '../domain/OrderStateValidator.js';
import { ConflictError } from '../../../shared/errors/DomainErrors.js';

export class PrismaOrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveMasterOrder(order: MasterOrderAggregate): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Capacity Enforcement Inside Transaction (Prevents concurrent capacity oversubscription)
      for (const subOrder of order.subOrders) {
        // Acquire row lock on Stall to serialize concurrent checkouts targeting the same stall
        await tx.$queryRaw`SELECT id FROM "Stall" WHERE id = ${subOrder.stallId} FOR UPDATE`;

        const stallCap = await tx.stallCapacity.findUnique({
          where: { stallId: subOrder.stallId },
        });
        if (stallCap) {
          const activeCount = await tx.subOrder.count({
            where: {
              stallId: subOrder.stallId,
              id: { not: subOrder.id },
              status: {
                in: [
                  SubOrderStatus.PENDING_PAYMENT,
                  SubOrderStatus.PAYMENT_CONFIRMED,
                  SubOrderStatus.CONFIRMED,
                  SubOrderStatus.PREPARING,
                  SubOrderStatus.READY,
                ],
              },
            },
          });
          if (activeCount >= stallCap.maxActiveOrders) {
            throw new ConflictError(
              `Stall has reached maximum kitchen capacity (${stallCap.maxActiveOrders} active orders). Please try again shortly.`
            );
          }
        }
      }

      // 2. Upsert Master Order
      await tx.masterOrder.upsert({
        where: { id: order.id },
        create: {
          id: order.id,
          studentId: order.studentId,
          orderNumber: order.orderNumber,
          status: order.status,
          totalAmount: new Prisma.Decimal(order.totalAmount),
          advancePercentage: order.advancePercentage,
          advanceAmount: new Prisma.Decimal(order.advanceAmount),
          remainingAmount: new Prisma.Decimal(order.remainingAmount),
          amountPaid: new Prisma.Decimal(order.amountPaid),
        },
        update: {
          status: order.status,
          amountPaid: new Prisma.Decimal(order.amountPaid),
        },
      });

      // 3. Upsert Sub Orders, Items & Pickup Schedules
      for (const subOrder of order.subOrders) {
        await tx.subOrder.upsert({
          where: { id: subOrder.id },
          create: {
            id: subOrder.id,
            masterOrderId: order.id,
            stallId: subOrder.stallId,
            subOrderNumber: subOrder.subOrderNumber,
            status: subOrder.status,
            subtotalAmount: new Prisma.Decimal(subOrder.subtotalAmount),
            advancePaidAmount: new Prisma.Decimal(subOrder.advancePaidAmount),
            balanceDueAmount: new Prisma.Decimal(subOrder.balanceDueAmount),
            isBalancePaid: subOrder.isBalancePaid,
            pickupGraceExpiresAt: subOrder.pickupGraceExpiresAt,
          },
          update: {
            status: subOrder.status,
            advancePaidAmount: new Prisma.Decimal(subOrder.advancePaidAmount),
            balanceDueAmount: new Prisma.Decimal(subOrder.balanceDueAmount),
            isBalancePaid: subOrder.isBalancePaid,
            pickupGraceExpiresAt: subOrder.pickupGraceExpiresAt,
          },
        });

        for (const item of subOrder.items) {
          await tx.orderItem.upsert({
            where: { id: item.id },
            create: {
              id: item.id,
              subOrderId: subOrder.id,
              menuItemId: item.menuItemId || null,
              snapshotItemName: item.snapshotItemName,
              snapshotPrice: new Prisma.Decimal(item.snapshotPrice),
              snapshotPrepMinutes: item.snapshotPrepMinutes,
              quantity: item.quantity,
              totalPrice: new Prisma.Decimal(item.totalPrice),
            },
            update: {
              // Historical item snapshots are immutable
            },
          });
        }

        if (subOrder.pickupSchedule) {
          await tx.pickupSchedule.upsert({
            where: { subOrderId: subOrder.id },
            create: {
              id: subOrder.pickupSchedule.id || crypto.randomUUID(),
              subOrderId: subOrder.id,
              requestedPickupTime: subOrder.pickupSchedule.requestedPickupTime,
              scheduledPickupTime: subOrder.pickupSchedule.scheduledPickupTime,
              earliestFeasiblePickupTime: subOrder.pickupSchedule.earliestFeasiblePickupTime,
              preparationTimeMinutes: subOrder.pickupSchedule.preparationTimeMinutes,
              queueDelayMinutes: subOrder.pickupSchedule.queueDelayMinutes,
              operationalBufferMinutes: subOrder.pickupSchedule.operationalBufferMinutes,
              capacityConstraintApplied: subOrder.pickupSchedule.capacityConstraintApplied ?? false,
            },
            update: {
              scheduledPickupTime: subOrder.pickupSchedule.scheduledPickupTime,
              earliestFeasiblePickupTime: subOrder.pickupSchedule.earliestFeasiblePickupTime,
            },
          });
        }
      }
    });
  }

  async findMasterOrderById(id: string): Promise<MasterOrderAggregate | null> {
    const raw = await this.prisma.masterOrder.findUnique({
      where: { id },
      include: {
        subOrders: {
          include: {
            items: true,
            pickupSchedule: true,
          },
        },
      },
    });
    if (!raw) return null;

    return this.mapToDomainMaster(raw);
  }

  async findMasterOrderByOrderNumber(orderNumber: string): Promise<MasterOrderAggregate | null> {
    const raw = await this.prisma.masterOrder.findUnique({
      where: { orderNumber },
      include: {
        subOrders: {
          include: {
            items: true,
            pickupSchedule: true,
          },
        },
      },
    });
    if (!raw) return null;

    return this.mapToDomainMaster(raw);
  }

  async findMasterOrdersByStudentId(studentId: string): Promise<MasterOrderAggregate[]> {
    const raws = await this.prisma.masterOrder.findMany({
      where: { studentId },
      include: {
        subOrders: {
          include: {
            items: true,
            pickupSchedule: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return raws.map(r => this.mapToDomainMaster(r));
  }

  async findSubOrderById(subOrderId: string): Promise<SubOrderAggregate | null> {
    const raw = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
      include: {
        items: true,
        pickupSchedule: true,
      },
    });
    if (!raw) return null;

    return this.mapToDomainSub(raw);
  }

  async findSubOrdersByStallId(stallId: string, statuses?: SubOrderStatus[]): Promise<SubOrderAggregate[]> {
    const raws = await this.prisma.subOrder.findMany({
      where: {
        stallId,
        ...(statuses ? { status: { in: statuses } } : {}),
      },
      include: {
        items: true,
        pickupSchedule: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return raws.map(r => this.mapToDomainSub(r));
  }

  async saveSubOrder(subOrder: SubOrderAggregate): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.subOrder.update({
        where: { id: subOrder.id },
        data: {
          status: subOrder.status,
          advancePaidAmount: new Prisma.Decimal(subOrder.advancePaidAmount),
          balanceDueAmount: new Prisma.Decimal(subOrder.balanceDueAmount),
          isBalancePaid: subOrder.isBalancePaid,
          pickupGraceExpiresAt: subOrder.pickupGraceExpiresAt,
        },
      });

      // Update parent MasterOrder status dynamically based on all sibling suborders
      const siblingSubOrders = await tx.subOrder.findMany({
        where: { masterOrderId: subOrder.masterOrderId },
        select: { status: true },
      });

      if (siblingSubOrders.length > 0) {
        const derivedStatus = OrderStateValidator.deriveMasterOrderStatus(
          siblingSubOrders.map(s => s.status as SubOrderStatus)
        );
        await tx.masterOrder.update({
          where: { id: subOrder.masterOrderId },
          data: { status: derivedStatus },
        });
      }
    });
  }

  async countActiveSubOrdersForStall(stallId: string): Promise<number> {
    return this.prisma.subOrder.count({
      where: {
        stallId,
        status: {
          in: [
            SubOrderStatus.PENDING_PAYMENT,
            SubOrderStatus.PAYMENT_CONFIRMED,
            SubOrderStatus.CONFIRMED,
            SubOrderStatus.PREPARING,
            SubOrderStatus.READY,
          ],
        },
      },
    });
  }

  async createNotification(props: {
    userId: string;
    type: string;
    title: string;
    message: string;
    payload?: unknown;
  }): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: props.userId,
        type: props.type as any,
        title: props.title,
        message: props.message,
        payload: props.payload ? (props.payload as any) : undefined,
      },
    });
  }

  private mapToDomainMaster(raw: any): MasterOrderAggregate {
    const subAggs = raw.subOrders.map((s: any) => this.mapToDomainSub(s));

    return new MasterOrderAggregate({
      id: raw.id,
      studentId: raw.studentId,
      orderNumber: raw.orderNumber,
      advancePercentage: raw.advancePercentage,
      subOrders: subAggs,
      status: raw.status as MasterOrderStatus,
      amountPaid: raw.amountPaid ? Number(raw.amountPaid) : 0,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  private mapToDomainSub(raw: any): SubOrderAggregate {
    const itemSnapshots = (raw.items || []).map((i: any) => new OrderItemSnapshot({
      id: i.id,
      subOrderId: i.subOrderId,
      menuItemId: i.menuItemId,
      snapshotItemName: i.snapshotItemName,
      snapshotPrice: Number(i.snapshotPrice),
      snapshotPrepMinutes: i.snapshotPrepMinutes,
      quantity: i.quantity,
      totalPrice: Number(i.totalPrice),
    }));

    return new SubOrderAggregate({
      id: raw.id,
      masterOrderId: raw.masterOrderId,
      stallId: raw.stallId,
      subOrderNumber: raw.subOrderNumber,
      items: itemSnapshots,
      status: raw.status as SubOrderStatus,
      advancePaidAmount: raw.advancePaidAmount ? Number(raw.advancePaidAmount) : 0,
      balanceDueAmount: raw.balanceDueAmount ? Number(raw.balanceDueAmount) : 0,
      isBalancePaid: Boolean(raw.isBalancePaid),
      pickupGraceExpiresAt: raw.pickupGraceExpiresAt,
      pickupSchedule: raw.pickupSchedule ? {
        id: raw.pickupSchedule.id,
        requestedPickupTime: raw.pickupSchedule.requestedPickupTime,
        scheduledPickupTime: raw.pickupSchedule.scheduledPickupTime,
        earliestFeasiblePickupTime: raw.pickupSchedule.earliestFeasiblePickupTime,
        preparationTimeMinutes: raw.pickupSchedule.preparationTimeMinutes,
        queueDelayMinutes: raw.pickupSchedule.queueDelayMinutes,
        operationalBufferMinutes: raw.pickupSchedule.operationalBufferMinutes,
        capacityConstraintApplied: raw.pickupSchedule.capacityConstraintApplied,
      } : undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
