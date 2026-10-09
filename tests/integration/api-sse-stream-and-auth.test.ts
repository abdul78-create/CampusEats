import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import crypto from 'node:crypto';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { UserRole } from '../../src/modules/identity/domain/IdentityEnums.js';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';
import { RealtimeController } from '../../src/modules/realtime/presentation/RealtimeController.js';
import { SseConnectionManager } from '../../src/modules/realtime/application/SseConnectionManager.js';
import { SseTicketStore } from '../../src/modules/realtime/infrastructure/SseTicketStore.js';
import { InMemoryEventBus } from '../../src/modules/realtime/domain/EventBus.js';
import { OutboxRepository } from '../../src/modules/realtime/infrastructure/OutboxRepository.js';
import { DomainEventType } from '../../src/modules/realtime/domain/RealtimeEnums.js';
import { DomainEventEnvelope } from '../../src/modules/realtime/domain/RealtimeInterfaces.js';

describe('Phase 6 — Real-Time SSE Stream, Authorization & Channel Isolation', () => {
  const prisma = PrismaService.getClient();
  const eventBus = new InMemoryEventBus();
  const ticketStore = new SseTicketStore(30);
  const outboxRepo = new OutboxRepository(prisma);
  const connectionManager = new SseConnectionManager(eventBus, prisma);
  const controller = new RealtimeController(prisma, ticketStore, connectionManager, outboxRepo);

  const ts = Date.now().toString(36);
  const studentId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const staffUserId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const stallId = crypto.randomUUID();
  const otherStallId = crypto.randomUUID();

  beforeAll(async () => {
    // 1. Seed Student
    await prisma.user.create({
      data: {
        id: studentId,
        email: `student_sse_${ts}@campus.edu`,
        phoneNumber: `+9195${Math.floor(10000000 + Math.random() * 90000000)}`,
        passwordHash: '$2b$12$secureMockHash',
        role: UserRole.STUDENT,
        studentProfile: {
          create: {
            fullName: 'SSE Student',
            universityRegNumber: `REG-SSE-${ts}`,
            accountStatus: 'ACTIVE',
          },
        },
      },
    });

    // 2. Seed Stall Owner & Stalls
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `owner_sse_${ts}@campus.edu`,
        phoneNumber: `+9195${Math.floor(10000000 + Math.random() * 90000000)}`,
        passwordHash: '$2b$12$secureMockHash',
        role: UserRole.STALL_OWNER,
        ownedStalls: {
          create: [
            {
              id: stallId,
              name: 'SSE Stall 1',
              campusBlock: 'Block A',
              liveStatus: StallStatus.OPEN,
              processingMode: OrderProcessingMode.AUTOMATIC,
              isApproved: true,
              capacity: {
                create: {
                  maxActiveOrders: 20,
                  pickupGracePeriodMinutes: 15,
                },
              },
            },
            {
              id: otherStallId,
              name: 'SSE Stall 2',
              campusBlock: 'Block B',
              liveStatus: StallStatus.OPEN,
              processingMode: OrderProcessingMode.AUTOMATIC,
              isApproved: true,
              capacity: {
                create: {
                  maxActiveOrders: 20,
                  pickupGracePeriodMinutes: 15,
                },
              },
            },
          ],
        },
      },
    });

    // 3. Seed Stall Staff for Stall 1
    await prisma.user.create({
      data: {
        id: staffUserId,
        email: `staff_sse_${ts}@campus.edu`,
        phoneNumber: `+9195${Math.floor(10000000 + Math.random() * 90000000)}`,
        passwordHash: '$2b$12$secureMockHash',
        role: UserRole.STALL_STAFF,
        staffAccount: {
          create: {
            stallId: stallId,
            permissions: {
              create: [{ permission: 'MANAGE_ORDERS' }],
            },
          },
        },
      },
    });

    // 4. Seed Admin
    await prisma.user.create({
      data: {
        id: adminId,
        email: `admin_sse_${ts}@campus.edu`,
        phoneNumber: `+9195${Math.floor(10000000 + Math.random() * 90000000)}`,
        passwordHash: '$2b$12$secureMockHash',
        role: UserRole.ADMIN,
      },
    });
  });

  afterAll(async () => {
    connectionManager.destroy();
    await prisma.staffPermission.deleteMany({ where: { staffAccount: { stallId: { in: [stallId, otherStallId] } } } });
    await prisma.staffAccount.deleteMany({ where: { stallId: { in: [stallId, otherStallId] } } });
    await prisma.stallCapacity.deleteMany({ where: { stallId: { in: [stallId, otherStallId] } } });
    await prisma.stall.deleteMany({ where: { id: { in: [stallId, otherStallId] } } });
    await prisma.studentProfile.deleteMany({ where: { userId: studentId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, ownerId, staffUserId, adminId] } } });
    await prisma.$disconnect();
  });

  describe('Dynamic Role-Based Channel Resolution', () => {
    it('resolves user-specific channel for student: user:<studentId>', async () => {
      const channels = await controller.resolveAuthorizedChannels(studentId, UserRole.STUDENT);
      expect(channels).toEqual([`user:${studentId}`]);
    });

    it('resolves stall channels dynamically for stall owner across all owned stalls', async () => {
      const channels = await controller.resolveAuthorizedChannels(ownerId, UserRole.STALL_OWNER);
      expect(channels).toContain(`user:${ownerId}`);
      expect(channels).toContain(`stall:${stallId}`);
      expect(channels).toContain(`stall:${otherStallId}`);
      expect(channels.length).toBe(3);
    });

    it('resolves assigned stall channel for stall staff', async () => {
      const channels = await controller.resolveAuthorizedChannels(staffUserId, UserRole.STALL_STAFF);
      expect(channels).toContain(`user:${staffUserId}`);
      expect(channels).toContain(`stall:${stallId}`);
      expect(channels).not.toContain(`stall:${otherStallId}`);
    });

    it('resolves campus-wide administrative channel for admin', async () => {
      const channels = await controller.resolveAuthorizedChannels(adminId, UserRole.ADMIN);
      expect(channels).toContain(`user:${adminId}`);
      expect(channels).toContain('admin:campus');
    });
  });

  describe('Strict Channel Isolation & Targeted Event Delivery', () => {
    it('dispatches events only to authorized channel subscribers and isolates other tenants', async () => {
      const receivedFramesStudent: string[] = [];
      const receivedFramesStaff: string[] = [];

      // Mock Express Response objects
      const mockResStudent = {
        write: (chunk: string) => {
          receivedFramesStudent.push(chunk);
          return true;
        },
        end: () => {},
      } as any;

      const mockResStaff = {
        write: (chunk: string) => {
          receivedFramesStaff.push(chunk);
          return true;
        },
        end: () => {},
      } as any;

      // Register connection for Student
      const connStudent = connectionManager.registerConnection(
        studentId,
        UserRole.STUDENT,
        mockResStudent,
        [`user:${studentId}`]
      );
      const connIdStudent = connStudent.connectionId;

      // Register connection for Stall 1 Staff
      const connStaff = connectionManager.registerConnection(
        staffUserId,
        UserRole.STALL_STAFF,
        mockResStaff,
        [`user:${staffUserId}`, `stall:${stallId}`]
      );
      const connIdStaff = connStaff.connectionId;

      // Dispatch event on stall 1 channel
      const stall1Event: DomainEventEnvelope = {
        id: crypto.randomUUID(),
        channel: `stall:${stallId}`,
        sequenceNumber: 1,
        eventType: DomainEventType.KITCHEN_ORDER_INCOMING,
        aggregateType: 'SubOrder',
        aggregateId: crypto.randomUUID(),
        correlationId: 'corr_test_1',
        payload: {
          subOrderId: crypto.randomUUID(),
          subOrderNumber: 'ORD-001-A',
          orderNumber: 'ORD-001',
          stallId: stallId,
          items: [{ name: 'Test Food', quantity: 1 }],
          scheduledPickupTime: new Date().toISOString(),
          studentFirstName: 'Alex',
        },
        publishedAt: new Date().toISOString(),
      };

      eventBus.publish(stall1Event);

      // Verify Staff received the frame
      const staffReceived = receivedFramesStaff.some(frame => frame.includes('KITCHEN_ORDER_INCOMING'));
      expect(staffReceived).toBe(true);

      // Verify Student NEVER received the stall frame (tenant isolation)
      const studentReceived = receivedFramesStudent.some(frame => frame.includes('KITCHEN_ORDER_INCOMING'));
      expect(studentReceived).toBe(false);

      // Now dispatch event on student channel
      const studentEvent: DomainEventEnvelope = {
        id: crypto.randomUUID(),
        channel: `user:${studentId}`,
        sequenceNumber: 1,
        eventType: DomainEventType.SUBORDER_CONFIRMED,
        aggregateType: 'SubOrder',
        aggregateId: crypto.randomUUID(),
        correlationId: 'corr_test_2',
        payload: {
          subOrderId: crypto.randomUUID(),
          subOrderNumber: 'ORD-001-A',
          stallId: stallId,
          scheduledPickupTime: new Date().toISOString(),
          estimatedPrepMinutes: 10,
        },
        publishedAt: new Date().toISOString(),
      };

      eventBus.publish(studentEvent);

      // Verify Student received their event
      const studentGotOwn = receivedFramesStudent.some(frame => frame.includes('SUBORDER_CONFIRMED'));
      expect(studentGotOwn).toBe(true);

      // Verify Staff did NOT receive student's private event
      const staffGotStudentEvent = receivedFramesStaff.some(frame => frame.includes('SUBORDER_CONFIRMED'));
      expect(staffGotStudentEvent).toBe(false);

      connectionManager.unregisterConnection(connIdStudent);
      connectionManager.unregisterConnection(connIdStaff);
    });
  });

  describe('Session & Authorization Revalidation', () => {
    it('terminates active connection with ACCOUNT_SUSPENDED when student account is suspended', async () => {
      let terminatedReason = '';
      const mockRes = {
        write: (chunk: string) => {
          if (chunk.includes('ACCOUNT_SUSPENDED')) {
            terminatedReason = 'ACCOUNT_SUSPENDED';
          }
          return true;
        },
        end: () => {},
      } as any;

      const conn = connectionManager.registerConnection(
        studentId,
        UserRole.STUDENT,
        mockRes,
        [`user:${studentId}`]
      );
      const connId = conn.connectionId;

      // Temporarily mark student suspended
      await prisma.studentProfile.update({
        where: { userId: studentId },
        data: { accountStatus: 'SUSPENDED' },
      });

      // Trigger revalidation cycle
      await connectionManager.revalidateAllConnections();

      expect(terminatedReason).toBe('ACCOUNT_SUSPENDED');
      expect((connectionManager as any).connections.has(connId)).toBe(false);

      // Restore active status
      await prisma.studentProfile.update({
        where: { userId: studentId },
        data: { accountStatus: 'ACTIVE' },
      });
    });
  });
});
