import type { AccessMonths, AccessPlan } from "@kaspilo/shared";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDate(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : "—";
}

/** Admin grant types (docs/spec.md "Admin grants"). */
export const planLabel: Record<AccessPlan, string> = {
  paid: "Manual payment",
  vip: "Gift",
  family: "Family (no expiry)",
};

export const monthsLabel: Record<AccessMonths, string> = {
  12: "1 year",
  1: "1 month",
  2: "2 months",
  3: "3 months",
};
