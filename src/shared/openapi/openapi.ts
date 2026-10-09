export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'CampusEats REST API',
    version: '1.0.0',
    description: 'Production-grade backend API for university food-stall pre-ordering, intelligent scheduling, capacity management, and student verification.',
  },
  servers: [
    { url: '/api/v1', description: 'Primary API Gateway v1' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_FAILED' },
              message: { type: 'string', example: 'Request validation failed' },
              requestId: { type: 'string', example: 'req_123456789' },
              details: { type: 'array', items: { type: 'object' } },
              requestedTime: { type: 'string', format: 'date-time' },
              nextAvailableTime: { type: 'string', format: 'date-time' },
            },
            required: ['code', 'message', 'requestId'],
          },
        },
      },
      RegisterStudentRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', example: 'student@campus.edu' },
          password: { type: 'string', format: 'password', example: 'P@ssword123' },
          phoneNumber: { type: 'string', example: '+919876543210' },
          fullName: { type: 'string', example: 'Jane Doe' },
          universityRegNumber: { type: 'string', example: '2024CS00192' },
        },
        required: ['email', 'password', 'phoneNumber', 'fullName', 'universityRegNumber'],
      },
      LoginRequest: {
        type: 'object',
        properties: {
          identifier: { type: 'string', example: 'student@campus.edu' },
          password: { type: 'string', format: 'password', example: 'P@ssword123' },
        },
        required: ['identifier', 'password'],
      },
      RefreshTokenRequest: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        },
        required: ['refreshToken'],
      },
      LogoutRequest: {
        type: 'object',
        properties: {
          refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
        },
      },
      CheckoutRequest: {
        type: 'object',
        properties: {
          advancePercentage: { type: 'integer', enum: [50, 60, 70, 80, 90, 100], example: 50 },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                menuItemId: { type: 'string', format: 'uuid' },
                quantity: { type: 'integer', minimum: 1, example: 2 },
              },
              required: ['menuItemId', 'quantity'],
            },
          },
          requestedPickupTime: { type: 'string', format: 'date-time' },
        },
        required: ['advancePercentage', 'items'],
      },
      UpdateStallStatusRequest: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['OPEN', 'BUSY', 'TEMPORARILY_PAUSED', 'CLOSED'], example: 'OPEN' },
        },
        required: ['status'],
      },
      CreateMenuItemRequest: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Veg Cheese Burger' },
          description: { type: 'string', example: 'Crispy patty with fresh lettuce and melted cheddar' },
          price: { type: 'number', minimum: 1, example: 95.00 },
          category: { type: 'string', example: 'Burgers' },
          isVegetarian: { type: 'boolean', example: true },
          preparationTimeMinutes: { type: 'integer', minimum: 1, maximum: 180, example: 12 },
          availableQuantity: { type: 'integer', minimum: 0, example: 30 },
        },
        required: ['name', 'price', 'category'],
      },
      UpdateMenuItemRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number', minimum: 1 },
          category: { type: 'string' },
          isVegetarian: { type: 'boolean' },
          preparationTimeMinutes: { type: 'integer', minimum: 1, maximum: 180 },
        },
      },
      UpdateMenuItemAvailabilityRequest: {
        type: 'object',
        properties: {
          availabilityState: { type: 'string', enum: ['AVAILABLE', 'SOLD_OUT'], example: 'SOLD_OUT' },
        },
        required: ['availabilityState'],
      },
      UpdateStallCapacityRequest: {
        type: 'object',
        properties: {
          maxActiveOrders: { type: 'integer', minimum: 1, example: 25 },
          parallelPreparationLimit: { type: 'integer', minimum: 1, example: 4 },
          operationalBufferMinutes: { type: 'integer', minimum: 0, example: 3 },
          windowDurationMinutes: { type: 'integer', minimum: 1, example: 30 },
          maxOrdersPerWindow: { type: 'integer', minimum: 1, example: 20 },
        },
      },
      InitiatePaymentRequest: {
        type: 'object',
        properties: {
          orderId: { type: 'string', format: 'uuid' },
          upiVpa: { type: 'string', example: 'student@upi' },
        },
        required: ['orderId'],
      },
      PaymentInitiationResponse: {
        type: 'object',
        properties: {
          orderId: { type: 'string', format: 'uuid' },
          paymentId: { type: 'string', format: 'uuid' },
          attemptId: { type: 'string' },
          amountPaise: { type: 'integer', example: 14000 },
          amountRupees: { type: 'number', example: 140.00 },
          currency: { type: 'string', example: 'INR' },
          purpose: { type: 'string', enum: ['ADVANCE', 'REMAINING_BALANCE'], example: 'ADVANCE' },
          upiIntentUrl: { type: 'string', example: 'upi://pay?pa=campuseats@icici&pn=CampusEats&am=140.00&cu=INR' },
          dynamicQrSvg: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      InitiateBalancePaymentRequest: {
        type: 'object',
        properties: {
          subOrderId: { type: 'string', format: 'uuid' },
        },
        required: ['subOrderId'],
      },
      ProcessRefundRequest: {
        type: 'object',
        properties: {
          reason: { type: 'string', minLength: 3, maxLength: 500, example: 'Stall out of ingredients' },
        },
      },
      RefundResponse: {
        type: 'object',
        properties: {
          refundId: { type: 'string', format: 'uuid' },
          subOrderId: { type: 'string', format: 'uuid' },
          refundAmount: { type: 'number', example: 84.00 },
          refundStatus: { type: 'string', enum: ['REFUND_PENDING', 'PROCESSING', 'REFUNDED', 'FAILED'] },
          providerRefundId: { type: 'string', example: 'MOCK_REF_987654321' },
        },
      },
      IssueTicketResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              ticket: { type: 'string', example: 'sse_tkt_6b2f4...d8' },
              expiresInSeconds: { type: 'number', example: 30 },
            },
          },
        },
      },
      KitchenQueueResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              stallId: { type: 'string', format: 'uuid' },
              stallName: { type: 'string', example: 'Campus Chai & Snacks' },
              maxActiveOrders: { type: 'number', example: 20 },
              activePreparingCount: { type: 'number', example: 4 },
              surgeEvaluation: {
                type: 'object',
                properties: {
                  isSurgeActive: { type: 'boolean', example: false },
                  utilizationPercentage: { type: 'number', example: 20 },
                },
              },
              queueCount: { type: 'number', example: 5 },
              queue: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    subOrderId: { type: 'string', format: 'uuid' },
                    subOrderNumber: { type: 'string', example: 'ORD-1001-A' },
                    masterOrderId: { type: 'string', format: 'uuid' },
                    orderNumber: { type: 'string', example: 'ORD-1001' },
                    queueState: { type: 'string', enum: ['QUEUED', 'IN_PREPARATION', 'READY_FOR_PICKUP', 'COMPLETED', 'REJECTED', 'EXPIRED_UNCOLLECTED'] },
                    status: { type: 'string' },
                    scheduledPickupTime: { type: 'string', format: 'date-time' },
                    graceDetails: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        graceStart: { type: 'string', format: 'date-time' },
                        graceExpiry: { type: 'string', format: 'date-time' },
                        warningAt: { type: 'string', format: 'date-time' },
                        isWarningActive: { type: 'boolean' },
                        isExpired: { type: 'boolean' },
                      },
                    },
                    studentFirstName: { type: 'string', example: 'Jane' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', example: 'Masala Dosa' },
                          quantity: { type: 'number', example: 2 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Liveness probe',
        tags: ['Health'],
        responses: {
          200: { description: 'Process alive' },
        },
      },
    },
    '/ready': {
      get: {
        summary: 'Readiness probe',
        tags: ['Health'],
        responses: {
          200: { description: 'PostgreSQL database connected' },
          503: { description: 'Database disconnected' },
        },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register new student account',
        tags: ['Authentication'],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterStudentRequest' } } },
        },
        responses: {
          201: { description: 'Registration successful' },
          409: { description: 'Email or phone already registered' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate user and obtain HMAC-signed JWT tokens',
        tags: ['Authentication'],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: { description: 'Authentication successful' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Rotate refresh token and obtain new access/refresh token pair',
        tags: ['Authentication'],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshTokenRequest' } } },
        },
        responses: {
          200: { description: 'Token rotation successful' },
          401: { description: 'Invalid, expired, revoked, or replayed refresh token' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Server-side revocation of refresh session and token family',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LogoutRequest' } } },
        },
        responses: {
          200: { description: 'Logged out and refresh session revoked' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get currently authenticated user profile',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'User profile retrieved' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/stalls': {
      get: {
        summary: 'Discover approved stalls with operating hours and capacity limits',
        tags: ['Stalls'],
        responses: {
          200: { description: 'List of active campus food stalls' },
        },
      },
    },
    '/stalls/{id}': {
      get: {
        summary: 'Get stall details by ID',
        tags: ['Stalls'],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Stall details retrieved' },
          404: { description: 'Stall not found' },
        },
      },
    },
    '/stalls/{id}/menu': {
      get: {
        summary: 'View stall menu items, real-time prices, prep times, and availability',
        tags: ['Stalls'],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Stall menu items retrieved' },
          404: { description: 'Stall not found' },
        },
      },
    },
    '/orders/checkout': {
      post: {
        summary: 'Atomic multi-stall checkout with authoritative pricing, advance payment calculation, and pickup feasibility check',
        tags: ['Ordering'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'header', name: 'Idempotency-Key', schema: { type: 'string' }, required: false },
        ],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CheckoutRequest' } } },
        },
        responses: {
          201: { description: 'Master order created successfully' },
          400: {
            description: 'Validation failed or infeasible pickup time (returns structured PICKUP_TIME_UNAVAILABLE with nextAvailableTime)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          403: { description: 'Unverified student account' },
          409: { description: 'Inventory stock unavailable or stall capacity limit reached' },
        },
      },
    },
    '/orders': {
      get: {
        summary: 'Retrieve authenticated student order history',
        tags: ['Ordering'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Paginated orders with sub-order snapshots and pickup schedules' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/orders/{id}': {
      get: {
        summary: 'Retrieve full master order details with isolated sub-orders',
        tags: ['Ordering'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Order details' },
          403: { description: 'Forbidden (IDOR protection)' },
          404: { description: 'Order not found' },
        },
      },
    },
    '/owner/stall': {
      get: {
        summary: 'View owned stall, operational status, capacity configuration, and operating hours',
        tags: ['Stall Owner'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Owned stall details' },
          403: { description: 'Forbidden for non-owners' },
          404: { description: 'No stall associated with account' },
        },
      },
    },
    '/owner/stall/status': {
      patch: {
        summary: 'Update stall operational state (OPEN, BUSY, TEMPORARILY_PAUSED, CLOSED) with hours governance',
        tags: ['Stall Owner'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateStallStatusRequest' } } },
        },
        responses: {
          200: { description: 'Stall status updated' },
          400: { description: 'Cannot open stall outside configured operating hours' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/owner/stall/capacity': {
      patch: {
        summary: 'Configure stall kitchen capacity limits (maxActiveOrders, parallelPreparationLimit, buffers)',
        tags: ['Stall Owner'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateStallCapacityRequest' } } },
        },
        responses: {
          200: { description: 'Stall capacity model updated' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/owner/stall/menu': {
      get: {
        summary: 'View stall menu items with inventory and availability state',
        tags: ['Stall Owner'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Stall menu items list' },
        },
      },
      post: {
        summary: 'Create a new menu item with initial inventory stock',
        tags: ['Stall Owner'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateMenuItemRequest' } } },
        },
        responses: {
          201: { description: 'Menu item created successfully' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/owner/stall/menu/{itemId}': {
      patch: {
        summary: 'Update menu item price, preparation time, category, or description',
        tags: ['Stall Owner'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'itemId', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateMenuItemRequest' } } },
        },
        responses: {
          200: { description: 'Menu item updated' },
          403: { description: 'Forbidden (BOLA defense: item does not belong to owned stall)' },
          404: { description: 'Menu item not found' },
        },
      },
      delete: {
        summary: 'Soft-delete menu item and mark as sold out',
        tags: ['Stall Owner'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'itemId', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Menu item soft-deleted' },
          403: { description: 'Forbidden' },
          404: { description: 'Menu item not found' },
        },
      },
    },
    '/owner/stall/menu/{itemId}/availability': {
      patch: {
        summary: 'Toggle menu item availability state between AVAILABLE and SOLD_OUT',
        tags: ['Stall Owner'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'itemId', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateMenuItemAvailabilityRequest' } } },
        },
        responses: {
          200: { description: 'Item availability state updated' },
          403: { description: 'Forbidden (BOLA defense)' },
          404: { description: 'Menu item not found' },
        },
      },
    },
    '/owner/orders': {
      get: {
        summary: 'View orders and active kitchen workload belonging to owned stall',
        tags: ['Stall Owner'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'List of owned stall sub-orders' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/sub-orders/{id}/confirm': {
      post: {
        summary: 'Operator confirms sub-order for kitchen execution',
        tags: ['SubOrder Lifecycle'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Sub-order marked as CONFIRMED' },
          403: { description: 'Forbidden (BOLA / role restriction)' },
        },
      },
    },
    '/sub-orders/{id}/prepare': {
      post: {
        summary: 'Operator initiates cooking; marks sub-order as PREPARING',
        tags: ['SubOrder Lifecycle'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Sub-order marked as PREPARING' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/sub-orders/{id}/ready': {
      post: {
        summary: 'Kitchen marks dishes READY for student pickup bay collection',
        tags: ['SubOrder Lifecycle'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Sub-order marked as READY' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/sub-orders/{id}/collect': {
      post: {
        summary: 'Authorized staff marks sub-order COLLECTED after balance is settled',
        tags: ['SubOrder Lifecycle'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Sub-order marked as COLLECTED' },
          400: { description: 'Remaining balance must be settled before collection' },
          403: { description: 'Forbidden (students cannot collect)' },
        },
      },
    },
    '/sub-orders/{id}/counter-settlement': {
      post: {
        summary: 'Record cash or in-person UPI settlement at stall counter',
        tags: ['SubOrder Lifecycle'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Counter payment recorded' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/sub-orders/{id}/reject': {
      post: {
        summary: 'Stall operator rejects sub-order due to kitchen surge (isolated failure)',
        tags: ['SubOrder Lifecycle'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Sub-order rejected and flagged for refund eligibility' },
          403: { description: 'Forbidden' },
        },
      },
    },

    // ==========================================
    // PHASE 4: STUDENT IDENTITY & VERIFICATION
    // ==========================================
    '/student/profile': {
      get: {
        summary: 'Retrieve authenticated student profile, university identity data, and ordering eligibility',
        tags: ['Student Identity'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Student profile retrieved successfully' },
          401: { description: 'Authentication required' },
          403: { description: 'Forbidden (student role required)' },
        },
      },
    },
    '/student/verification/status': {
      get: {
        summary: 'Retrieve live student identity verification state and ordering eligibility',
        tags: ['Student Identity'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Current verification lifecycle state' },
          401: { description: 'Authentication required' },
        },
      },
    },
    '/student/verification/document': {
      post: {
        summary: 'Upload university identity document for review (PDF, JPEG, PNG, max 5 MB)',
        tags: ['Student Identity'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  document: { type: 'string', format: 'binary' },
                  documentType: { type: 'string', default: 'UNIVERSITY_ID_CARD' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Identity document submitted and transitioned to UNDER_REVIEW' },
          400: { description: 'File validation failed (invalid MIME signature, empty, or oversized)' },
          401: { description: 'Authentication required' },
          403: { description: 'Forbidden (non-student role or suspended account)' },
          409: { description: 'Document re-submission blocked (already verified)' },
        },
      },
    },
    '/student/verification/document/{id}/url': {
      get: {
        summary: 'Retrieve short-lived signed download URL for student own identity document (IDOR protected)',
        tags: ['Student Identity'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Temporary signed URL generated' },
          403: { description: 'Forbidden (IDOR protection: cannot access other student document)' },
          404: { description: 'Document not found' },
        },
      },
    },

    // ==========================================
    // PHASE 4: ADMIN VERIFICATION & LIFECYCLE
    // ==========================================
    '/admin/verifications': {
      get: {
        summary: 'Paginated admin review queue for student identity verifications',
        tags: ['Admin Verification'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['PENDING_SUBMISSION', 'UNDER_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED'] } },
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Paginated review queue with student and document metadata' },
          401: { description: 'Authentication required' },
          403: { description: 'Forbidden (admin role required)' },
        },
      },
    },
    '/admin/verifications/{id}/document/url': {
      get: {
        summary: 'Administrator retrieves temporary signed URL to inspect student identity document',
        tags: ['Admin Verification'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Temporary signed URL generated (audited via STUDENT_DOCUMENT_ACCESSED)' },
          403: { description: 'Forbidden (admin role required)' },
          404: { description: 'Verification or document not found' },
        },
      },
    },
    '/admin/verifications/{id}/approve': {
      post: {
        summary: 'Administrator approves student verification and unlocks meal ordering',
        tags: ['Admin Verification'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Verification approved; student account transitioned to ACTIVE' },
          403: { description: 'Forbidden (admin role required)' },
          404: { description: 'Verification not found' },
          409: { description: 'Invalid state transition' },
        },
      },
    },
    '/admin/verifications/{id}/reject': {
      post: {
        summary: 'Administrator rejects student verification with structured rejection reason code',
        tags: ['Admin Verification'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reasonCode'],
                properties: {
                  reasonCode: {
                    type: 'string',
                    enum: [
                      'INVALID_DOCUMENT',
                      'DOCUMENT_UNREADABLE',
                      'WRONG_DOCUMENT_TYPE',
                      'IDENTITY_MISMATCH',
                      'EXPIRED_DOCUMENT',
                      'INSUFFICIENT_INFORMATION',
                      'DUPLICATE_SUBMISSION',
                      'OTHER',
                    ],
                  },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Verification rejected and student notified' },
          400: { description: 'Missing or invalid reasonCode' },
          403: { description: 'Forbidden (admin role required)' },
          404: { description: 'Verification not found' },
          409: { description: 'Invalid state transition' },
        },
      },
    },
    '/admin/students/{id}/suspend': {
      post: {
        summary: 'Administrator suspends student account and immediately blocks meal ordering',
        tags: ['Admin Verification'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Student account suspended' },
          403: { description: 'Forbidden (admin role required)' },
          404: { description: 'Student not found' },
        },
      },
    },
    '/admin/students/{id}/reactivate': {
      post: {
        summary: 'Administrator reactivates suspended student account and restores ordering eligibility',
        tags: ['Admin Verification'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Student account reactivated' },
          403: { description: 'Forbidden (admin role required)' },
          404: { description: 'Student not found' },
          409: { description: 'Cannot reactivate without prior approved verification' },
        },
      },
    },
    '/payments/initiate': {
      post: {
        summary: 'Initiate UPI advance payment attempt for an order (15-min TTL, dynamic QR, UPI intent)',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InitiatePaymentRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Payment attempt initiated successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaymentInitiationResponse' },
              },
            },
          },
          400: { description: 'Validation error (invalid advance percentage, order already paid, or unverified account)' },
          403: { description: 'Forbidden (IDOR protection or account suspended)' },
          404: { description: 'Order not found' },
        },
      },
    },
    '/payments/balance/online': {
      post: {
        summary: 'Initiate online balance payment attempt for a READY sub-order',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InitiateBalancePaymentRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Balance payment attempt initiated successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaymentInitiationResponse' },
              },
            },
          },
          400: { description: 'Sub-order not yet READY or balance already paid' },
          403: { description: 'Forbidden (IDOR protection)' },
          404: { description: 'Sub-order not found' },
        },
      },
    },
    '/payments/order/{orderId}': {
      get: {
        summary: 'Get comprehensive payment status and transaction ledger for an order',
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'orderId', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Payment and transaction details retrieved' },
          403: { description: 'Forbidden (IDOR protection)' },
          404: { description: 'Payment record not found' },
        },
      },
    },
    '/webhooks/payments': {
      post: {
        summary: 'Cryptographic HMAC-SHA256 signed payment provider webhook endpoint',
        tags: ['Webhooks'],
        parameters: [
          { in: 'header', name: 'x-webhook-signature', schema: { type: 'string' }, required: true },
          { in: 'header', name: 'x-webhook-timestamp', schema: { type: 'string' }, required: true },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        responses: {
          200: { description: 'Webhook processed and financial state transitioned atomically' },
          400: { description: 'Amount mismatch or invalid payload structure' },
          401: { description: 'Invalid HMAC signature or timestamp replay window expired' },
          404: { description: 'Transaction attempt not found' },
        },
      },
    },
    '/refunds/suborder/{id}': {
      post: {
        summary: 'Process server-authoritative fault-isolated sub-order refund (Admin only)',
        tags: ['Refunds'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
          { in: 'header', name: 'idempotency-key', schema: { type: 'string' }, required: false },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProcessRefundRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Refund processed successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RefundResponse' },
              },
            },
          },
          400: { description: 'Sub-order not REJECTED/CANCELLED or no advance to refund' },
          403: { description: 'Forbidden (Admin role required)' },
          404: { description: 'Sub-order not found' },
        },
      },
      get: {
        summary: 'Get sub-order refund status and ledger details',
        tags: ['Refunds'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: { description: 'Refund details retrieved' },
          403: { description: 'Forbidden (IDOR protection)' },
          404: { description: 'Refund record not found' },
        },
      },
    },
    '/events/ticket': {
      post: {
        summary: 'Issue short-lived single-use browser authentication ticket for SSE',
        tags: ['Real-Time Events'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Ticket issued successfully (30-second TTL)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/IssueTicketResponse' },
              },
            },
          },
          401: { description: 'Unauthorized' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/events/stream': {
      get: {
        summary: 'Connect to real-time Server-Sent Events (SSE) stream',
        tags: ['Real-Time Events'],
        parameters: [
          { in: 'query', name: 'ticket', schema: { type: 'string' }, description: 'Single-use 30s authentication ticket' },
          { in: 'header', name: 'Last-Event-ID', schema: { type: 'string' }, description: 'Last acknowledged event ID for catchup replay' },
        ],
        responses: {
          200: {
            description: 'SSE event stream established (text/event-stream)',
            content: {
              'text/event-stream': {
                schema: { type: 'string' },
              },
            },
          },
          401: { description: 'Unauthorized (invalid, expired, or replayed ticket)' },
          403: { description: 'Forbidden (Last-Event-ID channel authorization failure / BOLA)' },
          409: { description: 'Resync required (sequence gap exceeded max replay retention)' },
        },
      },
    },
    '/stalls/{stallId}/kitchen/queue': {
      get: {
        summary: 'Get live operational kitchen queue for a food stall',
        tags: ['Kitchen Operations'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'stallId', schema: { type: 'string', format: 'uuid' }, required: true },
        ],
        responses: {
          200: {
            description: 'Live kitchen queue retrieved with derived states, deterministic sort, and surge status',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/KitchenQueueResponse' },
              },
            },
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden: User is not authorized to view this stall queue' },
          404: { description: 'Stall not found' },
        },
      },
    },
  },
};
