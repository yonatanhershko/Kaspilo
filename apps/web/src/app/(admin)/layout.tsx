import type { ReactNode } from "react";

import { AdminGate } from "@/components/AdminGate";

/**
 * The admin area waits for the sign-in check in the browser before it shows a page,
 * so its navigations are allowed to block (Next.js instant-navigation validation).
 */
export const instant = false;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
