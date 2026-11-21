import { UserListPage } from "@/components/UserListPage";

export function UsersPage() {
  return (
    <UserListPage
      title="Users"
      subtitle="Extend access, change plans, renew expired accounts."
      emptyText="No users match."
    />
  );
}
