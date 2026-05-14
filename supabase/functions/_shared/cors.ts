import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, params',
}

/**
 * Validates that the request is authorized.
 * It must either:
 * 1. Have a valid SERVICE_ROLE_KEY in the Authorization header.
 * 2. Have a valid user JWT (checked via supabase.auth.getUser).
 */
export async function isAuthorized(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Path 1: Internal/Cron (Service Role)
  if (serviceRoleKey && token === serviceRoleKey) {
    return true;
  }

  // Path 2: Frontend User (JWT)
  // We manually verify the user token if it's not the service role
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.warn("User authorization failed:", error?.message);
      return false;
    }

    return true;
  } catch (e) {
    console.error("Authorization check exception:", e);
    return false;
  }
}
