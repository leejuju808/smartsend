// API v1 Authentication Middleware
// Supports Bearer token authentication with API keys

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export interface ApiKeyInfo {
  id: string;
  workspace_id: string;
  name: string | null;
  scopes?: string[];
  ip_whitelist?: string[];
  environment?: string;
}

export interface AuthResult {
  apiKey: ApiKeyInfo;
  workspaceId: string;
}

export interface ApiKeyInfo {
  id: string;
  workspace_id: string;
  name: string | null;
  scopes?: string[];
  ip_whitelist?: string[];
  environment?: string;
}

/**
 * Authenticate API request using Bearer token
 * Authorization: Bearer ss_live_xxxxxxxxx
 */
export async function authenticateApiRequest(
  req: NextRequest
): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError("401_INVALID_API_KEY", "Missing or invalid Authorization header");
  }

  const token = authHeader.substring(7); // Remove "Bearer "
  
  if (!token.startsWith("ss_live_") && !token.startsWith("ss_test_")) {
    throw new ApiError("401_INVALID_API_KEY", "Invalid API key format");
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get API key info with extended fields
  const { data: apiKey, error } = await supabase
    .from("api_keys")
    .select("id, workspace_id, name, revoked_at, scopes, ip_whitelist, environment")
    .eq("key", token)
    .single();

  if (error || !apiKey) {
    throw new ApiError("401_INVALID_API_KEY", "Invalid API key");
  }

  if (apiKey.revoked_at) {
    throw new ApiError("401_INVALID_API_KEY", "API key has been revoked");
  }

  // Check IP whitelist if configured
  if (apiKey.ip_whitelist && apiKey.ip_whitelist.length > 0) {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     req.headers.get("x-real-ip") ||
                     "unknown";
    
    const allowed = apiKey.ip_whitelist.some((allowedIp) => {
      // Simple CIDR matching (basic implementation)
      if (allowedIp === clientIp) return true;
      if (allowedIp.includes("/")) {
        // Basic CIDR check (simplified)
        const [network, prefix] = allowedIp.split("/");
        // In production, use proper CIDR matching library
        return clientIp.startsWith(network.split(".").slice(0, parseInt(prefix) / 8).join("."));
      }
      return false;
    });

    if (!allowed) {
      throw new ApiError("403_FORBIDDEN", "IP address not whitelisted", 403);
    }
  }

  // Update last_used timestamp
  await supabase
    .from("api_keys")
    .update({ last_used: new Date().toISOString() })
    .eq("id", apiKey.id);

  return {
    apiKey: {
      id: apiKey.id,
      workspace_id: apiKey.workspace_id,
      name: apiKey.name,
      scopes: apiKey.scopes,
      ip_whitelist: apiKey.ip_whitelist,
      environment: apiKey.environment,
    },
    workspaceId: apiKey.workspace_id,
  };
}

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "ApiError";
    
    // Map error codes to status codes
    if (code.startsWith("400_")) this.statusCode = 400;
    else if (code.startsWith("401_")) this.statusCode = 401;
    else if (code.startsWith("403_")) this.statusCode = 403;
    else if (code.startsWith("404_")) this.statusCode = 404;
    else if (code.startsWith("409_")) this.statusCode = 409;
    else if (code.startsWith("429_")) this.statusCode = 429;
    else if (code.startsWith("500_")) this.statusCode = 500;
  }

  toResponse() {
    return NextResponse.json(
      {
        error: {
          code: this.code,
          message: this.message,
        },
      },
      { status: this.statusCode }
    );
  }
}

/**
 * Check if API key has required scope
 */
export function hasScope(apiKey: ApiKeyInfo, requiredScope: string): boolean {
  if (!apiKey.scopes || apiKey.scopes.length === 0) {
    // No scopes means full access
    return true;
  }
  return apiKey.scopes.includes(requiredScope);
}

/**
 * Rate limiting middleware
 */
export async function checkRateLimit(
  apiKeyId: string,
  environment?: string,
  limitPerMinute: number = 60,
  limitPerDay: number = 5000
): Promise<boolean> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Use v2 function if available, otherwise fall back to v1
  const functionName = environment ? "check_rate_limit_v2" : "check_rate_limit";
  
  const params: any = {
    p_api_key_id: apiKeyId,
    p_limit_per_minute: limitPerMinute,
    p_limit_per_day: limitPerDay,
  };

  if (environment) {
    params.p_environment = environment;
  }

  const { data, error } = await supabase.rpc(functionName, params);

  if (error) {
    // Fallback to v1 if v2 doesn't exist
    if (functionName === "check_rate_limit_v2") {
      const { data: fallbackData, error: fallbackError } = await supabase.rpc("check_rate_limit", {
        p_api_key_id: apiKeyId,
        p_limit_per_minute: limitPerMinute,
        p_limit_per_day: limitPerDay,
      });
      
      if (fallbackError) {
        console.error("Rate limit check error:", fallbackError);
        return true; // Fail open
      }
      
      return fallbackData === true;
    }
    
    console.error("Rate limit check error:", error);
    // Fail open - allow request if rate limit check fails
    return true;
  }

  return data === true;
}

/**
 * Log API usage
 */
export async function logApiUsage(
  apiKeyId: string,
  workspaceId: string,
  endpoint: string,
  method: string,
  statusCode: number
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await supabase.from("api_usage_log").insert({
    api_key_id: apiKeyId,
    workspace_id: workspaceId,
    endpoint,
    method,
    status_code: statusCode,
  });
}

/**
 * Wrapper for API route handlers with auth and rate limiting
 */
export function withApiAuth(
  handler: (req: NextRequest, auth: AuthResult) => Promise<NextResponse>,
  options?: {
    requiredScope?: string;
  }
) {
  return async (req: NextRequest) => {
    try {
      // Authenticate
      const auth = await authenticateApiRequest(req);

      // Check scope if required
      if (options?.requiredScope) {
        if (!hasScope(auth.apiKey, options.requiredScope)) {
          throw new ApiError("403_FORBIDDEN", `Missing required scope: ${options.requiredScope}`, 403);
        }
      }

      // Check rate limit
      const rateLimitOk = await checkRateLimit(
        auth.apiKey.id,
        auth.apiKey.environment
      );
      if (!rateLimitOk) {
        throw new ApiError("429_RATE_LIMIT", "Rate limit exceeded", 429);
      }

      // Execute handler
      const response = await handler(req, auth);

      // Log usage
      const endpoint = req.nextUrl.pathname;
      const method = req.method;
      const statusCode = response.status;
      await logApiUsage(
        auth.apiKey.id,
        auth.workspaceId,
        endpoint,
        method,
        statusCode
      );

      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        return error.toResponse();
      }

      console.error("API error:", error);
      return NextResponse.json(
        {
          error: {
            code: "500_INTERNAL_ERROR",
            message: "Internal server error",
          },
        },
        { status: 500 }
      );
    }
  };
}



