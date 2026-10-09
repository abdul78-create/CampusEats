/**
 * CampusEats — Typed API response shapes
 * Derived from the backend OpenAPI spec and confirmed against integration tests.
 * These types are the frontend contract; never invent fields not returned by the API.
 */

// --- Envelope ----------------------------------------------------------------

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Array<{ field?: string; issue: string }>;
    requestedTime?: string;
    nextAvailableTime?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// --- Auth ---------------------------------------------------------------------

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  studentProfile?: StudentProfile | null;
  staffAccount?: StaffAccount | null;
  ownedStalls?: Array<{ id: string }>;
}

export type UserRole = "STUDENT" | "STALL_OWNER" | "STALL_STAFF" | "ADMIN";

// --- Student -----------------------------------------------------------------

export interface StudentProfile {
  id: string;
  fullName: string;
  universityRegNumber: string;
  accountStatus: StudentAccountStatus;
  profilePhotoUrl?: string | null;
}

export type StudentAccountStatus =
  | "PENDING_VERIFICATION"
  | "ACTIVE"
  | "SUSPENDED"
  | "REJECTED";

export interface StaffAccount {
  id: string;
  stallId: string | null;
  permissions: string[];
}

// --- Verification -------------------------------------------------------------

export type VerificationStatus =
  | "PENDING_SUBMISSION"
  | "UNDER_REVIEW"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED";

export interface VerificationStatusResponse {
  status: VerificationStatus;
  isEligibleToOrder: boolean;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  livenessVerification?: LivenessStatus | null;
}

export interface LivenessStatus {
  hasCompletedLiveness: boolean;
  isLiveHuman: boolean;
  consecutiveFailures: number;
  isLocked: boolean;
  lockedUntil?: string | null;
  verifiedAt?: string | null;
}

export interface LivenessSession {
  sessionId: string;
  sessionNonce: string;
  challengeSequence: LivenessChallengeType[];
  challengeParams: {
    blinkCount: 1 | 2;
    leftHoldSec: 1.5 | 2.5;
    rightHoldSec: 1.5 | 2.5;
    colorSeed: string;
  };
  expiresAt: string;
  ttlSeconds: number;
}

export type LivenessChallengeType =
  | "NATURAL_BLINK"
  | "HEAD_TURN_LEFT"
  | "HEAD_TURN_RIGHT";

// --- Stalls ------------------------------------------------------------------

export type StallStatus = "OPEN" | "BUSY" | "TEMPORARILY_PAUSED" | "CLOSED";

export interface Stall {
  id: string;
  name: string;
  description?: string | null;
  status?: StallStatus;
  liveStatus?: StallStatus;
  campusBlock?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  processingMode?: "MANUAL" | "AUTOMATIC" | string;
  estimatedPrepTimeMinutes?: number | null;
  capacity?: {
    maxActiveOrders: number;
    parallelPreparationLimit: number;
    operationalBufferMinutes: number;
  } | null;
  operatingHours?: OperatingHours[];
}

export interface OperatingHours {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  openTime: string;  // "HH:mm"
  closeTime: string;
}

// --- Menu --------------------------------------------------------------------

export interface MenuItem {
  id: string;
  stallId: string;
  name: string;
  description?: string | null;
  price: number;
  category: string;
  isVegetarian: boolean;
  isAvailable?: boolean;
  availableQuantity?: number | null;
  preparationTimeMinutes: number;
  imageUrl?: string | null;
  allergens?: string[];
  availabilityState?: string;
  isSoldOut?: boolean;
}

// --- Orders ------------------------------------------------------------------

export type MasterOrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_FAILED"
  | "CONFIRMED"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "CANCELLED";

export type SubOrderStatus =
  | "PENDING_ACCEPTANCE"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "COLLECTED"
  | "REJECTED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "EXPIRED_UNCOLLECTED";

export interface MasterOrder {
  id: string;
  studentId: string;
  status: MasterOrderStatus;
  totalAmount: number;
  advancePercentage: number;
  advanceAmount: number;
  remainingAmount: number;
  createdAt: string;
  subOrders: SubOrder[];
}

export interface SubOrder {
  id: string;
  masterOrderId: string;
  stallId: string;
  stallName: string;
  status: SubOrderStatus;
  scheduledPickupTime?: string | null;
  items: SubOrderItem[];
  subtotal: number;
  advancePaid: number;
  balanceDue: number;
}

export interface SubOrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

// --- Payments ----------------------------------------------------------------

export type PaymentStatus = "INITIATED" | "SUCCESS" | "FAILED" | "EXPIRED";

export interface PaymentSession {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  upiIntent?: string | null;
  qrCodeUrl?: string | null;
  expiresAt?: string | null;
}

// --- Realtime events --------------------------------------------------------

export type DomainEventType =
  | "ORDER_PAYMENT_CONFIRMED"
  | "BALANCE_PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "PAYMENT_EXPIRED"
  | "REFUND_PROCESSED"
  | "SUBORDER_CONFIRMED"
  | "SUBORDER_PREPARING"
  | "SUBORDER_READY"
  | "SUBORDER_COLLECTED"
  | "SUBORDER_REJECTED"
  | "KITCHEN_ORDER_INCOMING"
  | "KITCHEN_SURGE_ALERT"
  | "PICKUP_GRACE_WARNING"
  | "PICKUP_GRACE_EXPIRED"
  | "RESYNC_REQUIRED"
  | "SESSION_TERMINATED";

export type RealtimeEventType = DomainEventType | string;

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  id?: string;
  channel: string;
  sequenceNumber: string | number;
  eventType: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  serverTimestamp: string;
  publishedAt?: string;
  payloadVersion: number;
  correlationId?: string;
  payload: T;
}

export type RealtimeEvent<T = Record<string, unknown>> = DomainEventEnvelope<T>;

export interface SubOrderEventPayload {
  subOrderId: string;
  subOrderNumber: string;
  stallId?: string;
  scheduledPickupTime?: string;
  estimatedPrepMinutes?: number;
  startedAt?: string;
  readyAt?: string;
  pickupGraceExpiresAt?: string;
  collectedAt?: string;
  reason?: string;
}

export interface PaymentEventPayload {
  masterOrderId?: string;
  orderNumber?: string;
  amountPaid?: number;
  amountRemaining?: number;
  advancePercentage?: number;
  subOrderIds?: string[];
  subOrderId?: string;
  balancePaidAmount?: number;
  attemptId?: string;
  reason?: string;
}

