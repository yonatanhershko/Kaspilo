import type { Database } from "@kaspilo/shared";
import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

/**
 * Browser client with the publishable key. The admin's own session is the only
 * credential: every read and action is checked by Row Level Security and by
 * is_admin() inside the database functions. No secret key in this app.
 */
export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  { auth: { storageKey: "kaspilo-admin-auth" } },
);
