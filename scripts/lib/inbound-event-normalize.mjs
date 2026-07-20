const PT = "America/Los_Angeles";

export const JEREMY_FREY_EXHIBITION_URL = "https://museum.stanford.edu/exhibitions/jeremy-frey-woven-0";

export function inboundClock(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const detailed = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: PT,
  }).replace(/\s+/g, " ");
  if (detailed === "12:00:00 AM" || detailed === "11:59:59 PM") return null;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: PT,
  }).replace(/\s+/g, " ");
}

function officialOverride(event) {
  const date = String(event?.startsAt || "").slice(0, 10);
  const identity = `${event?.title || ""} ${event?.location || ""}`;
  if (date === "2026-07-20" && /jeremy\s+frey\s*:\s*woven/i.test(identity) && /cantor arts center/i.test(identity)) {
    return {
      url: JEREMY_FREY_EXHIBITION_URL,
      time: "11:00 AM",
      endTime: "6:00 PM",
    };
  }
  return null;
}

export function normalizeInboundEventPresentation(event) {
  const override = officialOverride(event);
  const time = override?.time || inboundClock(event?.startsAt);
  const parsedEndTime = inboundClock(event?.endsAt);
  const endTime = override?.endTime || (parsedEndTime && parsedEndTime !== time ? parsedEndTime : null);
  return {
    time,
    endTime,
    url: override?.url || event?.canonicalUrl || event?.sourceUrl || "",
  };
}
