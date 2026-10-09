"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  UtensilsCrossed,
  Plus,
  Edit2,
  Trash2,
  Search,
  Clock,
} from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import type { OwnerMenuItem } from "./ownerTypes";

export function MenuManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [editingItem, setEditingItem] = useState<OwnerMenuItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingInventoryId, setUpdatingInventoryId] = useState<string | null>(null);

  // Form fields for create/edit
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formCategory, setFormCategory] = useState("Main Course");
  const [formIsVeg, setFormIsVeg] = useState(true);
  const [formPrepTime, setFormPrepTime] = useState("10");
  const [formQuantity, setFormQuantity] = useState("50");

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<OwnerMenuItem[]>({
    queryKey: ["owner-menu"],
    queryFn: () => apiGet<OwnerMenuItem[]>("/owner/stall/menu"),
  });

  const menuItems = useMemo(() => data || [], [data]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set);
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (categoryFilter !== "ALL" && item.category !== categoryFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          item.name.toLowerCase().includes(term) ||
          (item.description && item.description.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [menuItems, categoryFilter, searchTerm]);

  const handleOpenCreate = () => {
    setFormName("");
    setFormDescription("");
    setFormPrice("");
    setFormCategory("Main Course");
    setFormIsVeg(true);
    setFormPrepTime("10");
    setFormQuantity("50");
    setIsCreating(true);
  };

  const handleOpenEdit = (item: OwnerMenuItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormDescription(item.description || "");
    setFormPrice(String(item.price));
    setFormCategory(item.category);
    setFormIsVeg(item.isVegetarian);
    setFormPrepTime(String(item.preparationTimeMinutes));
    setFormQuantity(String(item.availableQuantity));
  };

  const handleSaveItem = async () => {
    if (!formName.trim() || !formPrice) {
      toastError("Please provide an item name and price.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        // Edit existing menu item
        await apiPatch(`/owner/stall/menu/${editingItem.id}`, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          price: parseFloat(formPrice),
          category: formCategory.trim(),
          isVegetarian: formIsVeg,
          preparationTimeMinutes: parseInt(formPrepTime, 10) || 10,
        });

        // Also update inventory if changed
        if (parseInt(formQuantity, 10) !== editingItem.availableQuantity) {
          await apiPatch(`/owner/inventory/${editingItem.id}`, {
            availableQuantity: Math.max(0, parseInt(formQuantity, 10) || 0),
          });
        }

        toastSuccess("Menu item updated", `${formName} was updated successfully.`);
        setEditingItem(null);
      } else {
        // Create new menu item
        await apiPost("/owner/stall/menu", {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          price: parseFloat(formPrice),
          category: formCategory.trim(),
          isVegetarian: formIsVeg,
          preparationTimeMinutes: parseInt(formPrepTime, 10) || 10,
          availableQuantity: Math.max(0, parseInt(formQuantity, 10) || 0),
        });

        toastSuccess("Item added to menu", `${formName} is now live.`);
        setIsCreating(false);
      }

      refetch();
    } catch (err) {
      toastError(err, "Failed to save menu item");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAvailability = async (item: OwnerMenuItem) => {
    const newState = item.isSoldOut ? "AVAILABLE" : "SOLD_OUT";
    try {
      await apiPatch(`/owner/stall/menu/${item.id}/availability`, {
        availabilityState: newState,
      });
      toastSuccess(
        newState === "AVAILABLE" ? "Item available" : "Item marked Sold Out",
        `${item.name} is now ${newState.toLowerCase()}.`
      );
      refetch();
    } catch (err) {
      toastError(err, "Failed to update item availability");
    }
  };

  const handleAdjustInventory = async (item: OwnerMenuItem, delta: number) => {
    const newQty = Math.max(0, item.availableQuantity + delta);
    setUpdatingInventoryId(item.id);
    try {
      await apiPatch(`/owner/inventory/${item.id}`, {
        availableQuantity: newQty,
      });
      refetch();
    } catch (err) {
      toastError(err, "Failed to adjust inventory stock");
    } finally {
      setUpdatingInventoryId(null);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Are you sure you want to remove this item from your menu?")) return;
    try {
      await apiDelete(`/owner/stall/menu/${itemId}`);
      toastSuccess("Item removed", "Menu item was deleted.");
      refetch();
    } catch (err) {
      toastError(err, "Failed to delete menu item");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <span>Menu & Inventory Management</span>
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Manage your kitchen dishes, toggle real-time stock availability, and adjust station prep times.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/owner">
            <Button size="sm" variant="outline">
              ← Dashboard
            </Button>
          </Link>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={handleOpenCreate}
          >
            Add New Dish
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setCategoryFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              categoryFilter === "ALL"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
            }`}
          >
            All Dishes ({menuItems.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                categoryFilter === cat
                  ? "bg-[var(--accent)] text-white shadow-xs"
                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search menu dishes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      {/* Menu Items Table / Cards */}
      {isLoading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : isError ? (
        <div className="p-8 text-center rounded-2xl bg-[var(--danger-bg)] border border-[var(--border-subtle)] text-xs text-[var(--danger)] space-y-2">
          <p className="font-bold">Failed to load menu items.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-16 text-center rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
          <UtensilsCrossed className="w-8 h-8 text-[var(--text-tertiary)] mx-auto" />
          <h4 className="font-bold text-sm text-[var(--text-primary)]">
            No menu items found
          </h4>
          <p className="text-xs text-[var(--text-secondary)]">
            Create your first menu item to start accepting campus pre-orders.
          </p>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={handleOpenCreate}
          >
            Add First Dish
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              className={`border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all flex flex-col justify-between overflow-hidden ${
                item.isSoldOut ? "opacity-75 bg-[var(--bg-base)]" : "bg-[var(--bg-surface)]"
              }`}
            >
              <div className="p-4 sm:p-5 space-y-3">
                {/* Title & Veg Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                          item.isVegetarian
                            ? "border-emerald-500 text-emerald-500"
                            : "border-red-500 text-red-500"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.isVegetarian ? "bg-emerald-500" : "bg-red-500"
                          }`}
                        />
                      </span>
                      <h4 className="font-bold text-sm text-[var(--text-primary)]">
                        {item.name}
                      </h4>
                    </div>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-semibold uppercase">
                      {item.category}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="font-black text-sm text-[var(--text-primary)]">
                      ₹{item.price.toFixed(2)}
                    </span>
                  </div>
                </div>

                {item.description && (
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                    {item.description}
                  </p>
                )}

                {/* Preparation Time & Status */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>~{item.preparationTimeMinutes} min prep</span>
                  </div>

                  <span
                    className={`font-bold text-[11px] px-2 py-0.5 rounded-full ${
                      item.isSoldOut
                        ? "bg-[var(--danger-bg)] text-[var(--danger)]"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {item.isSoldOut ? "Sold Out" : "Available"}
                  </span>
                </div>

                {/* Stock Inventory Stepper */}
                <div className="p-2.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)] font-medium">
                    Stock Quantity:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={updatingInventoryId === item.id || item.availableQuantity <= 0}
                      onClick={() => handleAdjustInventory(item, -5)}
                      className="w-7 h-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-bold hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] disabled:opacity-40 transition-colors"
                      title="Decrease by 5"
                    >
                      -5
                    </button>
                    <span className="font-mono font-bold text-xs w-8 text-center text-[var(--text-primary)]">
                      {item.availableQuantity}
                    </span>
                    <button
                      type="button"
                      disabled={updatingInventoryId === item.id}
                      onClick={() => handleAdjustInventory(item, 5)}
                      className="w-7 h-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-bold hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors"
                      title="Increase by 5"
                    >
                      +5
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-3 bg-[var(--bg-base)] border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant={item.isSoldOut ? "primary" : "outline"}
                  onClick={() => handleToggleAvailability(item)}
                  className="text-xs flex-1 justify-center"
                >
                  {item.isSoldOut ? "Mark Available" : "Mark Sold Out"}
                </Button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(item)}
                    className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors"
                    title="Edit dish"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors"
                    title="Delete dish"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal Dialog */}
      <Dialog
        open={isCreating || !!editingItem}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreating(false);
            setEditingItem(null);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {editingItem ? `Edit ${editingItem.name}` : "Add New Dish"}
          </DialogTitle>
          <DialogDescription>
            {editingItem
              ? "Modify dish specifications and cooking parameters."
              : "Create a new meal offering for student pre-ordering."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-3">
          <Input
            label="Dish Name"
            placeholder="e.g. Masala Dosa"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />

          <Input
            label="Description"
            placeholder="e.g. Crispy fermented crepe served with sambar and coconut chutney"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Price (₹)"
              type="number"
              placeholder="e.g. 60"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
            />

            <Input
              label="Category"
              placeholder="e.g. Breakfast, Snacks"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Preparation Time (min)"
              type="number"
              placeholder="10"
              value={formPrepTime}
              onChange={(e) => setFormPrepTime(e.target.value)}
            />

            <Input
              label="Initial Inventory Quantity"
              type="number"
              placeholder="50"
              value={formQuantity}
              onChange={(e) => setFormQuantity(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isVegCheck"
              checked={formIsVeg}
              onChange={(e) => setFormIsVeg(e.target.checked)}
              className="rounded text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <label htmlFor="isVegCheck" className="text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
              Vegetarian Dish (Displays Green Veg mark)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsCreating(false);
              setEditingItem(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={isSubmitting}
            onClick={handleSaveItem}
          >
            {editingItem ? "Save Changes" : "Create Dish"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
