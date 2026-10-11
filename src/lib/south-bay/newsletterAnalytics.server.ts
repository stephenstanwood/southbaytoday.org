import { readNewsletterContext } from "./newsletterFunnel.ts";
import { serverEnv } from "./newsletterSignup.ts";

type ServerStage = "Newsletter confirmation sent" | "Newsletter confirmed";

/**
 * Vercel's server SDK copies the request URL from its request context even
 * when explicit headers are supplied. On /confirm that would expose the
 * signed email token. Use the same event transport with a fixed, clean URL.
 * Keep this payload aligned with @vercel/analytics/server when upgrading it.
 */
export async function trackNewsletterStage(stage: ServerStage, value: unknown, request: Request) {
  const context = readNewsletterContext(value);
  if (!context || serverEnv("VERCEL_ENV") !== "production") return;
  try {
    const response = await fetch("https://southbaytoday.org/_vercel/insights/event", {
      method: "POST",
      signal: AbortSignal.timeout(1500),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": request.headers.get("user-agent") || "",
        "x-vercel-ip": request.headers.get("x-forwarded-for") || "",
        "x-va-server": "1",
      },
      body: JSON.stringify({
        o: "https://southbaytoday.org/newsletters",
        ts: Date.now(),
        sdkn: "sbt-newsletter",
        sdkv: "1",
        r: "",
        en: stage,
        ed: context,
      }),
    });
    if (!response.ok) console.warn("Newsletter analytics unavailable", stage, response.status);
  } catch {
    // Tracking must never interrupt delivery or activation, or log a token/address.
    console.warn("Newsletter analytics unavailable", stage);
  }
}
