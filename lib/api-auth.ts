import { createClient } from "@/lib/supabase/server";

export async function apiAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : { supabase, user: data.user };
}
