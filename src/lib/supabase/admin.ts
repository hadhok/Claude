import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role client - server-only, bypasses RLS. Used exclusively to
 * resolve a canvas by its share_token before the requesting user has
 * membership (so a private-by-default canvas can still be reached by
 * whoever holds the link). Never import this from client code.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
