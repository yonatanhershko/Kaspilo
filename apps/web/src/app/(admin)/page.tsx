import { DashboardPage } from "./view";

/** Waits for the admin check in the browser, so navigation may block (see layout.tsx). */
export const instant = false;

export default function Page() {
  return <DashboardPage />;
}
