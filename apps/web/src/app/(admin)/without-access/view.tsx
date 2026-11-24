import { UserListPage } from "@/components/UserListPage";

export function ApprovalsPage() {
  return (
    <UserListPage
      title="Pending approvals"
      subtitle="New sign-ups waiting for their payment to be checked. Match the payer by name."
      fixedStatus="pending_approval"
      emptyText="No one is waiting for approval."
    />
  );
}
