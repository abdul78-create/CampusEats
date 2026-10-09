import { z } from 'zod';
import { StallStatus } from '../../modules/stall/domain/StallEnums.js';

// Reusable primitives
export const uuidSchema = z.string().uuid('Invalid UUID format');
export const phoneSchema = z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid E.164 phone number format');
export const emailSchema = z.string().email('Invalid email address format').max(255);
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters long')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Auth Schemas
export const registerStudentSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  phoneNumber: phoneSchema,
  fullName: z.string().min(2).max(128),
  universityRegNumber: z.string().min(3).max(64),
});

export const loginSchema = z.object({
  identifier: z.string().min(3).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(1, 'Password is required'),
}).refine(data => Boolean(data.identifier || data.email), {
  message: 'Either identifier or email is required',
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});


// Checkout Schemas
export const orderItemInputSchema = z.object({
  menuItemId: uuidSchema,
  quantity: z.number().int().positive('Quantity must be at least 1'),
});

export const checkoutRequestSchema = z.object({
  advancePercentage: z.number().refine(
    val => [50, 60, 70, 80, 90, 100].includes(val),
    { message: 'Advance percentage must be one of: 50, 60, 70, 80, 90, 100' }
  ),
  items: z.array(orderItemInputSchema).min(1, 'Order must contain at least one item'),
  requestedPickupTime: z.string().datetime().optional(),
});

// Stall Management Schemas
export const updateStallStatusSchema = z.object({
  status: z.nativeEnum(StallStatus, { errorMap: () => ({ message: 'Invalid stall operational status' }) }),
});

export const updateInventorySchema = z.object({
  availableQuantity: z.number().int().min(0, 'Quantity cannot be negative'),
});

export const createMenuItemSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(128),
  description: z.string().max(500).optional(),
  price: z.number().positive('Price must be greater than zero'),
  category: z.string().min(2).max(64),
  isVegetarian: z.boolean().default(true),
  preparationTimeMinutes: z.number().int().min(1).max(180).default(10),
  availableQuantity: z.number().int().min(0).default(0),
});

export const updateMenuItemSchema = z.object({
  name: z.string().min(2).max(128).optional(),
  description: z.string().max(500).optional(),
  price: z.number().positive('Price must be greater than zero').optional(),
  category: z.string().min(2).max(64).optional(),
  isVegetarian: z.boolean().optional(),
  preparationTimeMinutes: z.number().int().min(1).max(180).optional(),
});

export const updateMenuItemAvailabilitySchema = z.object({
  availabilityState: z.enum(['AVAILABLE', 'SOLD_OUT'], {
    errorMap: () => ({ message: 'Availability state must be AVAILABLE or SOLD_OUT' }),
  }),
});

export const updateStallCapacitySchema = z.object({
  maxActiveOrders: z.number().int().positive().optional(),
  maxOrdersPerWindow: z.number().int().positive().optional(),
  windowDurationMinutes: z.number().int().positive().optional(),
  maxOrdersPerPickupInterval: z.number().int().positive().optional(),
  pickupIntervalMinutes: z.number().int().positive().optional(),
  parallelPreparationLimit: z.number().int().positive().optional(),
  operationalBufferMinutes: z.number().int().min(0).optional(),
  pickupGracePeriodMinutes: z.number().int().positive().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one capacity field must be provided for update',
});

// Admin Schemas
export const operatingHourItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format must be HH:MM'),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format must be HH:MM'),
});

export const updateOperatingHoursSchema = z.object({
  stallId: uuidSchema,
  hours: z.array(operatingHourItemSchema).min(1),
});

export const processAdminRefundSchema = z.object({
  reason: z.string().min(3).max(500),
});

export const counterSettlementSchema = z.object({
  paymentMethod: z.enum(['CASH', 'UPI_COUNTER']).default('CASH'),
  notes: z.string().max(255).optional(),
});

// Payment & Refund Schemas
export const initiatePaymentSchema = z.object({
  orderId: uuidSchema,
  upiVpa: z.string().max(128).optional(),
});

export const initiateBalancePaymentSchema = z.object({
  subOrderId: uuidSchema,
});

export const processSubOrderRefundSchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});

