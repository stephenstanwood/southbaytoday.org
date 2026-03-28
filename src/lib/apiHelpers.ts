/** Shared API response helpers. */

export function errJson(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function okJson(data: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 10_000,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

export function validateLatLon(
  lat: unknown,
  lon: unknown,
): { latitude: number; longitude: number } | null {
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return null;
  }
  return { latitude: lat, longitude: lon };
}

/** Extract a string message from an unknown caught value. */
export function toErrMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build a 500 error JSON response. In development, includes a `debug` field with the raw
 * error message so internals are never exposed to production clients.
 */
export function devErrJson(message: string, errMsg: string): Response {
  const body =
    import.meta.env.DEV ? { error: message, debug: errMsg } : { error: message };
  return new Response(JSON.stringify(body), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Validate a user-supplied URL and block SSRF targets (localhost, RFC-1918 ranges, .local/.internal).
 * Returns the parsed URL on success, null on failure.
 */
export function isValidUrl(input: string): URL | null {
  try {
    let normalized = input.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      // RFC 1918: only 172.16.0.0–172.31.255.255, not all of 172.x.x.x
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      // Link-local range (AWS/GCP metadata endpoints)
      /^169\.254\./.test(hostname)
    ) {
      return null;
    }
    if (!hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}
