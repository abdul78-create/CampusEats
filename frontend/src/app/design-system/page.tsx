"use client";

import React, { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Send,
  Trash2,
  Search,
  ShoppingCart,
  Sliders,
  MoreVertical,
  Eye,
  Heart,
} from "lucide-react";
import { Heading, Lead, Muted } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  InteractiveCard,
} from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { Dropdown } from "@/components/ui/Dropdown";
import { Tabs } from "@/components/ui/Tabs";
import {
  CardSkeleton,
  StallCardSkeleton,
  MenuItemSkeleton,
} from "@/components/ui/Skeleton";
import {
  OrderStatusBadge,
  VerificationStatusBadge,
  PaymentStatusBadge,
  StallStatusBadge,
} from "@/components/ui/StatusBadge";
import { Navbar } from "@/components/ui/Navbar";
import { toastSuccess, toastError } from "@/lib/api/errors";
import {
  FadeUp,
  StaggerContainer,
  StaggerItem,
} from "@/components/motion/MotionPrimitives";

export default function DesignSystemPage() {
  // State for interactive components
  const [btnLoading, setBtnLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bottomDrawerOpen, setBottomDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("buttons");
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [hasInputError, setHasInputError] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />

      <main id="main-content" className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-16">
        {/* Header */}
        <div className="mb-12">
          <FadeUp>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-subtle)] text-[var(--accent-text)] text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Phase F1: Component Library
            </div>
            <Heading level={1} className="mb-3">
              Design System Showcase
            </Heading>
            <Lead>
              Interactive catalog of accessible, motion-enabled UI primitives built for CampusEats.
            </Lead>
          </FadeUp>
        </div>

        {/* Section Tabs */}
        <div className="mb-10 overflow-x-auto pb-2">
          <Tabs
            tabs={[
              { id: "buttons", label: "Buttons & Badges" },
              { id: "forms", label: "Form Controls" },
              { id: "cards", label: "Cards & Motion" },
              { id: "modals", label: "Dialogs & Drawers" },
              { id: "domain", label: "Domain Status" },
              { id: "skeletons", label: "Skeletons" },
            ]}
            activeId={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* TAB 1: Buttons & Badges */}
        {activeTab === "buttons" && (
          <StaggerContainer className="space-y-10">
            <StaggerItem>
              <Card>
                <CardHeader>
                  <CardTitle>Buttons</CardTitle>
                  <CardDescription>
                    Spring micro-interactions with loading states and icon slots.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Muted className="mb-3 font-semibold uppercase text-xs">Variants</Muted>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="primary" leftIcon={<Send className="w-4 h-4" />}>
                        Primary Action
                      </Button>
                      <Button variant="secondary">Secondary Action</Button>
                      <Button variant="outline">Outline Action</Button>
                      <Button variant="subtle">Subtle Action</Button>
                      <Button variant="ghost">Ghost Action</Button>
                      <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />}>
                        Destructive
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Muted className="mb-3 font-semibold uppercase text-xs">Sizes &amp; States</Muted>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="sm">Small (sm)</Button>
                      <Button size="md">Medium (md)</Button>
                      <Button size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                        Large (lg)
                      </Button>
                      <Button size="icon" aria-label="Cart action">
                        <ShoppingCart className="w-4 h-4" />
                      </Button>
                      <Button
                        loading={btnLoading}
                        onClick={() => {
                          setBtnLoading(true);
                          setTimeout(() => setBtnLoading(false), 2000);
                        }}
                      >
                        {btnLoading ? "Processing" : "Click for Loading"}
                      </Button>
                      <Button disabled>Disabled Button</Button>
                    </div>
                  </div>

                  <div>
                    <Muted className="mb-3 font-semibold uppercase text-xs">Toasts (Sonner)</Muted>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          toastSuccess("Pickup scheduled", "Kitchen notified at Stall #4")
                        }
                      >
                        Trigger Success Toast
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          toastError(
                            "Pickup slot unavailable",
                            "The kitchen reached peak preparation capacity."
                          )
                        }
                      >
                        Trigger Error Toast
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card>
                <CardHeader>
                  <CardTitle>Badges</CardTitle>
                  <CardDescription>
                    Semantic status indicators with optional animated pulse dots.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Badge variant="brand">Brand Badge</Badge>
                    <Badge variant="success" dot pulseDot>
                      Live Online
                    </Badge>
                    <Badge variant="warning" dot>
                      Warning Alert
                    </Badge>
                    <Badge variant="danger" dot>
                      Error State
                    </Badge>
                    <Badge variant="info">Information</Badge>
                    <Badge variant="neutral">Neutral Tag</Badge>
                    <Badge variant="default">Default</Badge>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          </StaggerContainer>
        )}

        {/* TAB 2: Form Controls */}
        {activeTab === "forms" && (
          <StaggerContainer className="space-y-8">
            <StaggerItem>
              <Card>
                <CardHeader>
                  <CardTitle>Form Inputs</CardTitle>
                  <CardDescription>
                    Accessible inputs with icons, validation errors, and helper hints.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 max-w-xl">
                  <Input
                    label="Search Stalls"
                    placeholder="Search campus canteens or items..."
                    leftIcon={<Search className="w-4 h-4" />}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    helperText="Try searching by stall name or meal category"
                  />

                  <div>
                    <Input
                      label="Pickup Slot Validation Example"
                      placeholder="e.g. 12:45 PM"
                      error={hasInputError ? "Requested pickup slot is outside operational hours" : undefined}
                      helperText={!hasInputError ? "Slots are evaluated by backend capacity engines" : undefined}
                    />
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setHasInputError((prev) => !prev)}
                      >
                        Toggle Error State
                      </Button>
                    </div>
                  </div>

                  <Select
                    label="Campus Food Court"
                    options={[
                      { value: "north", label: "North Campus Food Hub (Active)" },
                      { value: "south", label: "South Student Plaza" },
                      { value: "library", label: "Central Library Cafe" },
                    ]}
                  />

                  <Textarea
                    label="Special Cooking Instructions"
                    placeholder="e.g. Extra spicy, no onions, separate sauce packet..."
                    rows={3}
                    helperText="Transmitted directly to kitchen station display upon payment confirmation"
                  />

                  <div className="pt-2">
                    <Checkbox
                      label="Confirm Advance Payment Policy"
                      description="I acknowledge that advance payments (50%-100%) reserve capacity at the chosen kitchen."
                      checked={checkboxChecked}
                      onChange={(e) => setCheckboxChecked(e.target.checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          </StaggerContainer>
        )}

        {/* TAB 3: Cards & Motion */}
        {activeTab === "cards" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Static Card</CardTitle>
                <CardDescription>
                  Standard elevated card surface with subtle border tokens.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Used for persistent layout sections, settings groups, and dashboard overviews.
                </p>
              </CardContent>
              <CardFooter className="justify-between">
                <Badge variant="neutral">Read Only</Badge>
                <Button size="sm" variant="ghost">
                  Details
                </Button>
              </CardFooter>
            </Card>

            <InteractiveCard>
              <CardHeader>
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="brand">Interactive</Badge>
                  <Heart className="w-4 h-4 text-[var(--text-tertiary)]" />
                </div>
                <CardTitle>Interactive Motion Card</CardTitle>
                <CardDescription>
                  Hover over this card to observe the Framer Motion spring lift.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Used for stall discovery cards, menu items, and active order queue items.
                </p>
              </CardContent>
              <CardFooter className="justify-between">
                <span className="text-xs font-semibold text-[var(--accent-text)]">
                  Clickable
                </span>
                <ArrowRight className="w-4 h-4 text-[var(--accent)]" />
              </CardFooter>
            </InteractiveCard>
          </div>
        )}

        {/* TAB 4: Dialogs & Drawers */}
        {activeTab === "modals" && (
          <Card>
            <CardHeader>
              <CardTitle>Modals, Drawers &amp; Dropdowns</CardTitle>
              <CardDescription>
                Overlay surfaces with backdrop blur, keyboard listeners, and spring animations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => setDialogOpen(true)}>Open Modal Dialog</Button>
                <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
                  Open Right Drawer (Cart/Menu)
                </Button>
                <Button variant="outline" onClick={() => setBottomDrawerOpen(true)}>
                  Open Bottom Sheet (Mobile)
                </Button>

                {/* Dropdown Menu */}
                <Dropdown
                  trigger={
                    <Button variant="subtle" rightIcon={<MoreVertical className="w-4 h-4" />}>
                      Dropdown Actions
                    </Button>
                  }
                  items={[
                    {
                      label: "View Stall Info",
                      icon: <Eye className="w-4 h-4" />,
                      onClick: () => toastSuccess("Viewing stall information"),
                    },
                    {
                      label: "Filter Categories",
                      icon: <Sliders className="w-4 h-4" />,
                      onClick: () => toastSuccess("Filters applied"),
                    },
                    "divider",
                    {
                      label: "Cancel Selection",
                      icon: <Trash2 className="w-4 h-4" />,
                      danger: true,
                      onClick: () => toastError("Selection cleared"),
                    },
                  ]}
                />
              </div>

              {/* Dialog Instance */}
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent onClose={() => setDialogOpen(false)}>
                  <DialogHeader>
                    <DialogTitle>Confirm Order Reservation</DialogTitle>
                    <DialogDescription>
                      Review the backend-calculated advance payment split before confirming your pickup slot.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-2 text-sm text-[var(--text-secondary)]">
                    <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                      <span>Order Subtotal:</span>
                      <span className="font-semibold text-[var(--text-primary)]">₹180.00</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                      <span>Advance Percentage:</span>
                      <span className="font-semibold text-[var(--text-primary)]">60%</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                      <span>Advance Payable Now:</span>
                      <span className="font-semibold text-[var(--accent-text)]">₹108.00</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Balance at Collection:</span>
                      <span className="font-semibold text-[var(--text-primary)]">₹72.00</span>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setDialogOpen(false);
                        toastSuccess("Order intent created", "Redirecting to payment gateway");
                      }}
                    >
                      Proceed to Advance Payment
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Right Drawer Instance */}
              <Drawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                position="right"
                title="Your Order Tray"
                description="Review items before scheduling pickup"
                footer={
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-[var(--text-secondary)]">Tray Total</div>
                      <div className="text-lg font-bold text-[var(--text-primary)]">₹240.00</div>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setDrawerOpen(false);
                        toastSuccess("Tray confirmed");
                      }}
                    >
                      Schedule Pickup
                    </Button>
                  </div>
                }
              >
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        Paneer Butter Dosa &times; 2
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Stall #2 &bull; South Corner
                      </div>
                    </div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">₹160.00</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        Masala Chai &times; 4
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Stall #5 &bull; Chai Point
                      </div>
                    </div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">₹80.00</div>
                  </div>
                </div>
              </Drawer>

              {/* Bottom Sheet Drawer Instance */}
              <Drawer
                open={bottomDrawerOpen}
                onOpenChange={setBottomDrawerOpen}
                position="bottom"
                title="Mobile Pickup Selector"
                description="Choose guaranteed collection window"
                footer={
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => {
                      setBottomDrawerOpen(false);
                      toastSuccess("Slot reserved");
                    }}
                  >
                    Confirm Slot
                  </Button>
                }
              >
                <div className="space-y-3 py-2">
                  <p className="text-sm text-[var(--text-secondary)]">
                    Available slots verified against kitchen station prep capacity:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {["12:30 PM", "12:45 PM", "01:00 PM", "01:15 PM"].map((time, idx) => (
                      <button
                        key={time}
                        type="button"
                        className={`p-3 rounded-xl border text-sm font-semibold text-center transition-all ${
                          idx === 1
                            ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                            : "border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-primary)] hover:border-[var(--border-default)]"
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              </Drawer>
            </CardContent>
          </Card>
        )}

        {/* TAB 5: Domain Status */}
        {activeTab === "domain" && (
          <StaggerContainer className="space-y-8">
            <StaggerItem>
              <Card>
                <CardHeader>
                  <CardTitle>Order Lifecycle Statuses</CardTitle>
                  <CardDescription>
                    Directly mapped to backend SubOrder and MasterOrder finite state machines.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    <OrderStatusBadge status="CONFIRMED" />
                    <OrderStatusBadge status="PREPARING" />
                    <OrderStatusBadge status="READY" />
                    <OrderStatusBadge status="COLLECTED" />
                    <OrderStatusBadge status="REJECTED" />
                    <OrderStatusBadge status="EXPIRED_UNCOLLECTED" />
                    <OrderStatusBadge status="PARTIALLY_FULFILLED" />
                    <OrderStatusBadge status="REFUNDED" />
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <Card>
                <CardHeader>
                  <CardTitle>Verification, Payment &amp; Stall Statuses</CardTitle>
                  <CardDescription>
                    Strictly matching Phase 0–7 Prisma enums with no client-side fabrication.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Muted className="mb-2 font-semibold uppercase text-xs">Student Verification</Muted>
                    <div className="flex flex-wrap gap-2.5">
                      <VerificationStatusBadge status="ACTIVE" />
                      <VerificationStatusBadge status="PENDING_VERIFICATION" />
                      <VerificationStatusBadge status="REJECTED" />
                      <VerificationStatusBadge status="SUSPENDED" />
                    </div>
                  </div>

                  <div>
                    <Muted className="mb-2 font-semibold uppercase text-xs">Payment Sessions</Muted>
                    <div className="flex flex-wrap gap-2.5">
                      <PaymentStatusBadge status="INITIATED" />
                      <PaymentStatusBadge status="SUCCESS" />
                      <PaymentStatusBadge status="FAILED" />
                      <PaymentStatusBadge status="EXPIRED" />
                    </div>
                  </div>

                  <div>
                    <Muted className="mb-2 font-semibold uppercase text-xs">Stall Kitchen Operations</Muted>
                    <div className="flex flex-wrap gap-2.5">
                      <StallStatusBadge status="OPEN" />
                      <StallStatusBadge status="BUSY" />
                      <StallStatusBadge status="CLOSED" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          </StaggerContainer>
        )}

        {/* TAB 6: Skeletons */}
        {activeTab === "skeletons" && (
          <div className="space-y-8">
            <div>
              <Heading level={3} className="mb-2">
                Production-Geometry Skeletons
              </Heading>
              <Muted className="mb-6">
                Accurately match final content geometry to avoid Cumulative Layout Shift (CLS).
              </Muted>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Muted className="mb-2 font-semibold text-xs uppercase">Card Skeleton</Muted>
                <CardSkeleton />
              </div>
              <div>
                <Muted className="mb-2 font-semibold text-xs uppercase">Stall Card Skeleton</Muted>
                <StallCardSkeleton />
              </div>
              <div>
                <Muted className="mb-2 font-semibold text-xs uppercase">Menu Item Skeleton</Muted>
                <MenuItemSkeleton />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
