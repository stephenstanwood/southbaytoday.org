export const NEWSLETTER_PAGE_TYPES = ["home", "event", "event-day", "events", "city", "newsletters", "other"] as const;
export const NEWSLETTER_PLACEMENTS = ["card", "inline", "minimal"] as const;

export type NewsletterContext = {
  pageType: typeof NEWSLETTER_PAGE_TYPES[number];
  placement: typeof NEWSLETTER_PLACEMENTS[number];
};

/** Only bounded categories cross the API/token/analytics boundary; never URLs or form values. */
export function readNewsletterContext(value: unknown): NewsletterContext | null {
  if (!value || typeof value !== "object") return null;
  const { pageType, placement } = value as Record<string, unknown>;
  if (!NEWSLETTER_PAGE_TYPES.includes(pageType as NewsletterContext["pageType"]) ||
      !NEWSLETTER_PLACEMENTS.includes(placement as NewsletterContext["placement"])) return null;
  return { pageType, placement } as NewsletterContext;
}

export function newsletterPageType(pathname: string): NewsletterContext["pageType"] {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (path.startsWith("/event/")) return "event";
  if (/^\/events\/\d{4}-\d{2}-\d{2}$/.test(path)) return "event-day";
  if (path === "/events") return "events";
  if (path.startsWith("/city/")) return "city";
  if (path === "/newsletters" || path.startsWith("/newsletters/")) return "newsletters";
  return "other";
}
