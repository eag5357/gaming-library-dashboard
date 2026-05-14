import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, params',
}

/**
 * Decodes Postgres bytea (hex string or Uint8Array) to a UTF-8 string.
 */
export const byteaToString = (bytea: any) => {
  if (!bytea) return null;
  if (typeof bytea === 'string') {
    if (bytea.startsWith('\\x')) {
      const hex = bytea.slice(2);
      const bytes = hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16));
      return bytes ? new TextDecoder().decode(Uint8Array.from(bytes)) : null;
    }
    return bytea;
  }
  return new TextDecoder().decode(bytea);
}

/**
 * Creates a Supabase client with the service role key and fixes the local URL if needed.
 */
export function getSupabaseClient() {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace("http://kong:", "http://127.0.0.1:");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });
}

/**
 * Context about the authorized caller.
 */
export interface AuthContext {
  userId?: string;
  isServiceRole: boolean;
}

/**
 * Triggers the normalization process.
 */
export async function triggerNormalization() {
  console.log("Triggering auto-normalization...");
  const supabase = getSupabaseClient();
  try {
    const { data, error } = await supabase.functions.invoke('normalize-games');
    if (error) {
      console.error("Normalization trigger failed:", error);
      return { error: error.message || error };
    }
    console.log(`Normalization successful: ${data?.count || 0} games linked.`);
    return data;
  } catch (e: any) {
    console.error("Normalization exception:", e.message);
    return { error: e.message };
  }
}

/**
 * Validates the request and returns the authorization context.
 * Returns null if the request is not authorized.
 */
export async function getAuthContext(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get('Authorization');
  const apiKeyHeader = req.headers.get('apikey');
  
  if (!authHeader && !apiKeyHeader) {
    return null;
  }

  const token = (authHeader || '').replace(/^[Bb]earer\s+/, '').trim();
  const apiKey = (apiKeyHeader || '').trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  // Path 1: Service Role (Cron/Internal)
  if (serviceRoleKey && (token === serviceRoleKey || apiKey === serviceRoleKey)) {
    return { isServiceRole: true };
  }

  // Path 2: User JWT
  if (!token) return null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return null;
    }

    return { isServiceRole: false, userId: user.id };
  } catch (e) {
    console.error("Auth check exception:", e);
    return null;
  }
}

/**
 * Legacy wrapper for getAuthContext
 */
export async function isAuthorized(req: Request) {
  const context = await getAuthContext(req);
  return !!context;
}
