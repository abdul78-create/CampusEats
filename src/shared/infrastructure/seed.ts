/**
 * CAMPUS EATS — DEVELOPMENT SEED DATA SCRIPT
 * 
 * DISCLAIMER & WARNING:
 * THIS SCRIPT CONTAINS FIXTURES FOR LOCAL DEVELOPMENT AND AUTOMATED TESTING ONLY.
 * NEVER RUN IN PRODUCTION.
 * ZERO FAKE PAYMENT SETTLEMENTS.
 * ZERO FAKE VERIFIED BIOMETRIC CLAIMS.
 */

import { PrismaService } from './PrismaService.js';
import { UserRole, StudentAccountStatus } from '../../modules/identity/domain/IdentityEnums.js';
import { StallStatus, OrderProcessingMode, ItemAvailabilityState } from '../../modules/stall/domain/StallEnums.js';

export async function seedDevelopmentData(): Promise<void> {
  const prisma = PrismaService.getClient();

  console.log('[CampusEats Seed] Seeding development test fixtures...');

  // 1. Create Test Admin
  await prisma.user.upsert({
    where: { email: 'admin.dev@campus.edu' },
    create: {
      id: 'usr_dev_admin_1',
      email: 'admin.dev@campus.edu',
      phoneNumber: '+919999900001',
      passwordHash: '$2b$12$devHashForTestingPurposesOnlyNotForProd',
      role: UserRole.ADMIN,
    },
    update: {},
  });

  // 2. Create Test Stall Owner
  const owner = await prisma.user.upsert({
    where: { email: 'vendor.dosa@campus.edu' },
    create: {
      id: 'usr_dev_owner_dosa',
      email: 'vendor.dosa@campus.edu',
      phoneNumber: '+919999900002',
      passwordHash: '$2b$12$devHashForTestingPurposesOnlyNotForProd',
      role: UserRole.STALL_OWNER,
    },
    update: {},
  });

  // 3. Create Test Approved Stall
  const stall = await prisma.stall.upsert({
    where: { id: 'stl_dev_dosa_corner' },
    create: {
      id: 'stl_dev_dosa_corner',
      ownerId: owner.id,
      name: 'Dosa Corner',
      campusBlock: 'Food Court Block B',
      description: 'South Indian breakfast & lunch stall',
      liveStatus: StallStatus.OPEN,
      processingMode: OrderProcessingMode.AUTOMATIC,
      isApproved: true,
      capacity: {
        create: {
          maxActiveOrders: 20,
          maxOrdersPerWindow: 15,
          windowDurationMinutes: 30,
          maxOrdersPerPickupInterval: 5,
          pickupIntervalMinutes: 10,
          parallelPreparationLimit: 2,
          operationalBufferMinutes: 2,
          pickupGracePeriodMinutes: 15,
        },
      },
      operatingHours: {
        createMany: {
          data: [
            { dayOfWeek: 0, openTime: '09:00', closeTime: '17:00' },
            { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00' },
            { dayOfWeek: 2, openTime: '09:00', closeTime: '17:00' },
            { dayOfWeek: 3, openTime: '09:00', closeTime: '17:00' },
            { dayOfWeek: 4, openTime: '09:00', closeTime: '17:00' },
            { dayOfWeek: 5, openTime: '09:00', closeTime: '17:00' },
            { dayOfWeek: 6, openTime: '09:00', closeTime: '17:00' },
          ],
        },
      },
    },
    update: {},
  });

  // 4. Create Menu Items & Inventory
  await prisma.menuItem.upsert({
    where: { id: 'item_dev_masala_dosa' },
    create: {
      id: 'item_dev_masala_dosa',
      stallId: stall.id,
      name: 'Masala Dosa',
      description: 'Crisp crepe with spiced potato filling',
      price: 60.00,
      category: 'Breakfast',
      isVegetarian: true,
      ingredients: ['Rice batter', 'Potato', 'Onion', 'Ghee'],
      allergens: ['Dairy'],
      preparationTimeMinutes: 8,
      availabilityState: ItemAvailabilityState.AVAILABLE,
      inventory: {
        create: {
          availableQuantity: 25,
          reservedQuantity: 0,
        },
      },
    },
    update: {},
  });

  await prisma.menuItem.upsert({
    where: { id: 'item_dev_samosa' },
    create: {
      id: 'item_dev_samosa',
      stallId: stall.id,
      name: 'Samosa (Pair)',
      description: 'Crispy fried pastry with spiced potato peas filling',
      price: 30.00,
      category: 'Snacks',
      isVegetarian: true,
      ingredients: ['Wheat flour', 'Potato', 'Peas', 'Spices'],
      allergens: ['Gluten'],
      preparationTimeMinutes: 10,
      availabilityState: ItemAvailabilityState.AVAILABLE,
      inventory: {
        create: {
          availableQuantity: 50,
          reservedQuantity: 0,
        },
      },
    },
    update: {},
  });

  // 5. Create Test Active Student
  await prisma.user.upsert({
    where: { email: 'student.dev@campus.edu' },
    create: {
      id: 'usr_dev_student_active',
      email: 'student.dev@campus.edu',
      phoneNumber: '+919999900003',
      passwordHash: '$2b$12$devHashForTestingPurposesOnlyNotForProd',
      role: UserRole.STUDENT,
      studentProfile: {
        create: {
          fullName: 'Aarav Sharma',
          universityRegNumber: '2024CS00192',
          accountStatus: StudentAccountStatus.ACTIVE,
        },
      },
    },
    update: {},
  });

  console.log('[CampusEats Seed] Development test fixtures seeded successfully.');
}
