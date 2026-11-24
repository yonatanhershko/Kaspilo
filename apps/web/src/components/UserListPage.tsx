"use client";

import { useState } from "react";

import { fetchUsers, PAGE_SIZE, type UserFilter } from "@/lib/admin-api";
import { useAsync } from "@/lib/use-async";

import { NotifyDialog } from "./NotifyDialog";
import { UserTable } from "./UserTable";
import { Button, Card, DataState } from "./ui";

const filters: { value: UserFilter; label: string }[] = [
  { value: "all", label: "All users" },
  { value: "without_access", label: "Without access" },
  { value: "ending", label: "Ending within 7 days" },
  { value: "trial", label: "In trial" },
  { value: "paying", label: "Paying (store)" },
  { value: "admin", label: "Admin access" },
];

/** Searchable, paged user list. `fixedFilter` locks it to one filter. */
export function UserListPage({
  title,
  subtitle,
  fixedFilter,
  emptyText,
}: {
  title: string;
  subtitle: string;
  fixedFilter?: UserFilter;
  emptyText: string;
}) {
  const [filter, setFilter] = useState<UserFilter>(fixedFilter ?? "all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [notifyAll, setNotifyAll] = useState(false);

  const users = useAsync(
    () =>
      fetchUsers({
        filter,
        search,
        page,
      }),
    `${filter}|${search}|${page}`,
  );

  const total = users.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
          <p className="text-text-muted">{subtitle}</p>
        </div>
        {!fixedFilter && (
          <Button variant="ghost" onClick={() => setNotifyAll(true)}>
            Notify all active users
          </Button>
        )}
      </header>
      {notifyAll && <NotifyDialog target="all" onClose={() => setNotifyAll(false)} />}

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            type="search"
            aria-label="Search by name or email"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="h-11 w-full rounded-lg sm:w-64 md:h-9 border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
          />
          {!fixedFilter && (
            <select
              aria-label="Filter users"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as UserFilter);
                setPage(0);
              }}
              className="h-11 rounded-lg border border-border bg-surface px-2 text-sm md:h-9"
            >
              {filters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <DataState
          loading={users.loading && !users.data}
          error={users.error}
          empty={users.data?.rows.length === 0}
          emptyText={emptyText}
          onRetry={users.reload}
        />
        {!!users.data?.rows.length && (
          <UserTable users={users.data.rows} onChanged={users.reload} />
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
          <span>
            {total.toLocaleString("en")} {total === 1 ? "user" : "users"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              Page {page + 1} of {pages}
            </span>
            <Button
              variant="ghost"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
