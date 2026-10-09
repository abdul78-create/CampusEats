## 1. Stall Lifecycle & State Architecture

### 1.1 Operating Schedule vs. Live Counter State Authority
A strict operational and security boundary exists between **official operating hours** and **live counter status**:

| Concept | Governing Authority | Description |
| :--- | :--- | :--- |
| **Operating Hours** | **`ADMIN` Only** | Platform administrators configure weekly open/close windows (e.g. Mon–Fri 09:00–17:00). Stall owners cannot modify these hours. |
| **Live Counter State** | **`STALL_OWNER`** | The owner toggles actual physical readiness: `CLOSED`, `OPEN`, `BUSY`, `TEMPORARILY_PAUSED`. |

### 1.2 Out-of-Hours Policy Enforcement
1. **Attempting to Open Outside Operating Hours**:
   If a stall owner attempts to set `liveStatus = OPEN` when current time is outside the admin-configured operating hours, the server rejects the request with `OutsideOperatingHoursError`.
2. **Order Prohibition**:
   Even if a stall was left in `OPEN`, the ordering engine actively validates that the current timestamp is within official operating hours before accepting any new order checkout.
3. **The Activation Rule**:
   Within official operating hours (e.g. at 09:15 AM), if the stall owner has not arrived and pressed **START**, the stall remains in state `CLOSED`. Students cannot order from a closed stall.

```
                  ┌────────────────────────┐
                  │         CLOSED         │
                  └───────────┬────────────┘
                              │ Owner taps "START STALL"
                              ▼
                  ┌────────────────────────┐
   ┌─────────────►│          OPEN          │◄─────────────┐
   │              └───────────┬────────────┘              │
   │                          │ Queue exceeds 80%         │
   │ Queue drops below 60%    ▼                           │ Manual resume
   │              ┌────────────────────────┐              │
   └──────────────┤          BUSY          │              │
                  └───────────┬────────────┘              │
                              │ Owner taps "PAUSE"        │
                              ▼                           │
                  ┌────────────────────────┐              │
                  │   TEMPORARILY_PAUSED   ├──────────────┘
                  └───────────┬────────────┘
                              │ Owner taps "END DAY / CLOSE"
                              ▼
                  ┌────────────────────────┐
                  │         CLOSED         │
                  └────────────────────────┘
```

---

## 2. Order Processing Modes (Strategy Pattern)

Every stall operates in either **`MANUAL`** or **`AUTOMATIC`** mode, configurable in stall settings:

### 2.1 MANUAL Mode (`ManualOrderAcceptanceStrategy`)
1. Student completes advance payment. Sub-order enters `PAYMENT_CONFIRMED`.
2. Sub-order appears on stall terminal with a countdown timer (default: 3 minutes).
3. Stall staff inspects kitchen conditions and either:
   - **Accepts**: Sub-order transitions to `CONFIRMED`. Queue slot is locked.
   - **Rejects**: Stall staff selects a reason (e.g. *Out of gas*, *Kitchen backlog*). Sub-order transitions to `REJECTED`, and an isolated refund is triggered.
4. If timer expires without action: The order auto-rejects to avoid leaving the student hanging.

### 2.2 AUTOMATIC Mode (`AutomaticOrderAcceptanceStrategy`)
1. Student completes advance payment.
2. The acceptance engine automatically checks:
   - Kitchen active orders < `maxActiveOrders`.
   - Window throughput < `maxOrdersPerWindow`.
   - All ordered items have sufficient `availableQuantity`.
   - Calculated pickup feasibility meets scheduling criteria.
3. If all constraints pass: Sub-order automatically transitions to `CONFIRMED`, reserving inventory and queue slots instantly.
4. If constraints fail: Order is rejected with a transparent capacity error, and an immediate refund is dispatched.

---

## 3. Configurable Capacity Engine Parameters

Capacity parameters are tuned per stall based on kitchen size and staffing:

| Parameter | Type | Default | Operational Impact |
| :--- | :--- | :--- | :--- |
| `maxActiveOrders` | `Int` | `20` | Max simultaneous orders permitted in `CONFIRMED` + `PREPARING`. |
| `maxOrdersPerWindow` | `Int` | `15` | Max orders accepted within a moving time window. |
| `windowDurationMinutes`| `Int` | `30` | Duration of the rate-limiting sliding window. |
| `maxOrdersPerPickupInterval`| `Int`| `5` | Prevents counter bottlenecks at any single pickup timestamp. |
| `pickupIntervalMinutes`| `Int` | `10` | Discretization bucket for counter handoffs. |
| `parallelPreparationLimit`| `Int`| `4` | Number of simultaneous dishes cookable in parallel. |
| `operationalBufferMinutes`| `Int`| `2` | Buffer for packaging and counter transfer. |
| `pickupGracePeriodMinutes`| `Int`| `15` | Window student has to collect before order is marked `EXPIRED`. |

---

## 4. Menu, Inventory & Historical Immutability

### 4.1 Menu Item Schema
- `id`: UUID.
- `stallId`: UUID.
- `name`: Dish title (e.g. "Masala Dosa").
- `price`: INR ₹ (Decimal 10,2).
- `category`: Classification (e.g. "Breakfast", "Beverages", "Snacks").
- `isVegetarian`: Boolean flag.
- `ingredients`: Array of strings (e.g. `["Potato", "Rice Batter", "Ghee"]`).
- `allergens`: Array of strings (e.g. `["Dairy", "Gluten", "Nuts"]`).
- `preparationTimeMinutes`: Baseline cooking duration (e.g. 8 mins).
- `availabilityState`: `AVAILABLE` or `SOLD_OUT`.

### 4.2 Inventory Depletion & Stockouts
1. Every menu item has an attached `MenuItemInventory` record:
   - `availableQuantity`: Real-time stock available for sale.
   - `reservedQuantity`: Items held in `PENDING_PAYMENT` or `CONFIRMED` states.
2. When `availableQuantity` reaches zero:
   - Item automatically transitions to `SOLD_OUT`.
   - The item is disabled in the catalog; new orders cannot include it.
3. If an item becomes unavailable after payment confirmation:
   - The student receives an in-app prompt to wait or cancel the sub-order with full isolated refund.

### 4.3 Historical Snapshot Guarantee
When an order is created, the system copies:
- Dish name $\longrightarrow$ `OrderItem.snapshotItemName`
- Unit price $\longrightarrow$ `OrderItem.snapshotPrice`
- Prep duration $\longrightarrow$ `OrderItem.snapshotPrepMinutes`

**Guarantee:** If a stall owner raises the price of "Masala Dosa" from ₹60 to ₹80 tomorrow, or renames it, all historical orders retain ₹60 and the original name indefinitely.

---

## 5. Staff Delegation & Access Control

Stall owners can provision auxiliary `STALL_STAFF` logins with granular permissions:

```typescript
export enum StaffPermissionType {
  MANAGE_ORDERS    = 'MANAGE_ORDERS',    // Move orders between PREPARING, READY, COLLECTED
  MANAGE_MENU      = 'MANAGE_MENU',      // Edit item descriptions, toggle SOLD_OUT
  MANAGE_INVENTORY = 'MANAGE_INVENTORY', // Adjust stock counts
  VIEW_PAYMENTS    = 'VIEW_PAYMENTS',    // View payment amounts collected
  VIEW_ANALYTICS   = 'VIEW_ANALYTICS',   // View sales reports and rush analytics
}
```

Every incoming request checks permissions server-side:
```typescript
if (!staffAccount.hasPermission(StaffPermissionType.MANAGE_ORDERS)) {
  throw new ForbiddenException('Staff member lacks permission to transition order state');
}
```
Ordinary staff accounts can **never** alter stall bank accounts, delete stalls, or provision other staff.
