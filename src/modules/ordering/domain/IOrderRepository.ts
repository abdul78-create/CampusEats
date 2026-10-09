import { MasterOrderAggregate } from './MasterOrderAggregate.js';
import { SubOrderAggregate } from './SubOrderAggregate.js';
import { SubOrderStatus } from './OrderEnums.js';

export interface IOrderRepository {
  saveMasterOrder(order: MasterOrderAggregate): Promise<void>;
  findMasterOrderById(id: string): Promise<MasterOrderAggregate | null>;
  findMasterOrderByOrderNumber(orderNumber: string): Promise<MasterOrderAggregate | null>;
  findMasterOrdersByStudentId(studentId: string): Promise<MasterOrderAggregate[]>;
  findSubOrderById(subOrderId: string): Promise<SubOrderAggregate | null>;
  findSubOrdersByStallId(stallId: string, statuses?: SubOrderStatus[]): Promise<SubOrderAggregate[]>;
  saveSubOrder(subOrder: SubOrderAggregate): Promise<void>;
  countActiveSubOrdersForStall(stallId: string): Promise<number>;
  createNotification(props: { userId: string; type: string; title: string; message: string; payload?: unknown }): Promise<void>;
}
