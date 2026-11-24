import { UserListPage } from "@/components/UserListPage";

/** Signed up, no access now (never had it, or it ended). The admin may give access. */
export function WithoutAccessPage() {
  return (
    <UserListPage
      title="Without access"
      subtitle="Signed up and locked: never had access, or it ended. Give access for a gift or a payment made outside the app."
      fixedFilter="without_access"
      emptyText="Everyone has access."
    />
  );
}
