export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, params',
}

/**
 * Validates that the request is authorized.
 * It must either:
 * 1. Have a valid SERVICE_ROLE_KEY in the Authorization header.
 * 2. (Optional) Be a validly authenticated user.
 * 
 * For background workers like sync, we primarily want to ensure it's either
 * the project itself (service_role) or our own frontend.
 */
export function isAuthorized(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // If the token matches our internal service role key, it's authorized.
  if (serviceRoleKey && token === serviceRoleKey) {
    return true;
  }

  // If we wanted to allow ANY authenticated user, we would verify the JWT here.
  // But for sync functions, we usually want to restrict it to service_role 
  // or handle user-specific RLS inside the function code.
  
  return false;
}
