import { eventToSchema } from "./eventSchema";

export const CIVIC_EVENT_IMAGE_URL = "https://southbaytoday.org/og/og-gov.jpg";

export interface CivicMeetingSchemaRecord {
  date?: string | null;
  bodyName?: string | null;
  location?: string | null;
  url?: string | null;
}

interface CivicMeetingSchemaOptions {
  cityId: string;
  cityName: string;
  cityWebsite?: string | null;
  meeting?: CivicMeetingSchemaRecord | null;
}

/** Map a source-confirmed civic meeting through the site's shared Event schema.
 * The generic local-government artwork accurately represents every council
 * meeting; no photograph of a different event is implied. */
export function civicMeetingToSchema({
  cityId,
  cityName,
  cityWebsite,
  meeting,
}: CivicMeetingSchemaOptions): Record<string, unknown> | null {
  if (!meeting?.date) return null;

  return eventToSchema({
    title: `${cityName} ${meeting.bodyName || "City Council"} meeting`,
    date: meeting.date,
    venue: meeting.location || `${cityName} City Hall`,
    organizerName: `${cityName} City Council`,
    organizerUrl: cityWebsite,
    cityName,
    url: meeting.url,
    pageUrl: `https://southbaytoday.org/gov/${cityId}`,
    image: CIVIC_EVENT_IMAGE_URL,
    description: `Official meeting information for the ${cityName} City Council.`,
  });
}
