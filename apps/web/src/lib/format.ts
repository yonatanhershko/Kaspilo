import type { AccessMonths, AccessPlan, AccountStatus } from "@kaspilo/shared";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDate(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : "—";
}

export const statusLabel: Record<AccountStatus, string> = {
  pending_approval: "Pending",
  active: "Active",
  expired: "Expired",
  rejected: "Rejected",
};

export const planLabel: Record<AccessPlan, string> = {
  paid: "Paid",
  vip: "VIP (no payment)",
  family: "Family (no expiry)",
};

export const monthsLabel: Record<AccessMonths, string> = {
  12: "1 year",
  2: "2 months",
};

export const planShort: Record<AccessPlan, string> = {
  paid: "Paid",
  vip: "VIP",
  family: "Family",
};
