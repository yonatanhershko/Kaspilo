import { UserListPage } from "@/components/UserListPage";

export function UsersPage() {
  return (
    <UserListPage
      title="Users"
      subtitle="Store subscriptions, admin access, history."
      emptyText="No users match."
    />
  );
}
