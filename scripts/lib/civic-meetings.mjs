const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function ptDateISO(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Use the meeting URL supplied by Legistar itself. EventId/EventGuid belong to
 * the Web API and cannot be rebuilt as public-site ID/GUID parameters. If the
 * provider URL is missing or crosses hosts, fall back to the official calendar
 * filtered to the exact meeting date.
 */
export function legistarMeetingUrl(site, date, eventInSiteUrl = null) {
  if (!/^[a-z0-9-]+$/i.test(String(site || ""))) throw new Error("invalid Legistar site");
  if (!ISO_DATE.test(String(date || ""))) throw new Error("invalid meeting date");
  const expectedHost = `${site.toLowerCase()}.legistar.com`;
  const providerUrl = safeHttpUrl(eventInSiteUrl);
  if (
    providerUrl?.protocol === "https:"
    && providerUrl.hostname.toLowerCase() === expectedHost
    && /\/MeetingDetail\.aspx$/i.test(providerUrl.pathname)
    && (providerUrl.searchParams.has("LEGID") || providerUrl.searchParams.has("ID"))
  ) {
    return providerUrl.href;
  }

  const [year, month, day] = date.split("-").map(Number);
  const displayDate = `${month}/${day}/${year}`;
  const calendar = new URL(`https://${expectedHost}/Calendar.aspx`);
  calendar.searchParams.set("From", displayDate);
  calendar.searchParams.set("To", displayDate);
  return calendar.href;
}

/** Attach the exact first-party observation that makes a meeting publishable. */
export function confirmMeeting(meeting, { provider, sourceUrl, observedDate = meeting?.date } = {}) {
  if (!meeting || !ISO_DATE.test(String(meeting.date || ""))) return null;
  if (observedDate !== meeting.date || !String(provider || "").trim()) return null;
  const source = safeHttpUrl(sourceUrl);
  if (!source) return null;
  return {
    ...meeting,
    confirmation: {
      status: "confirmed",
      provider: String(provider),
      observedDate,
      sourceUrl: source.href,
    },
  };
}

export function isConfirmedMeeting(meeting) {
  const confirmation = meeting?.confirmation;
  if (!meeting || !ISO_DATE.test(String(meeting.date || ""))) return false;
  if (confirmation?.status !== "confirmed" || confirmation.observedDate !== meeting.date) return false;
  return Boolean(String(confirmation.provider || "").trim() && safeHttpUrl(confirmation.sourceUrl));
}

/** Final fail-closed publication gate. Recurrence projections have no exact
 * first-party observation and therefore cannot enter the committed artifact. */
export function onlyConfirmedMeetings(meetings) {
  return Object.fromEntries(
    Object.entries(meetings || {}).filter(([, meeting]) => isConfirmedMeeting(meeting)),
  );
}

/** Select the next concrete CivicClerk event in a bounded window. */
export function pickCivicClerkMeeting(events, today, { maxDays = 60 } = {}) {
  if (!ISO_DATE.test(String(today || ""))) return null;
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + maxDays);
  const endDate = end.toISOString().slice(0, 10);

  return (Array.isArray(events) ? events : [])
    .filter((event) => event?.categoryName === "City Council")
    .filter((event) => !/cancel(?:led|ed)|postponed/i.test(String(event.eventName || "")))
    .filter((event) => {
      const date = String(event?.eventDate || "").slice(0, 10);
      return ISO_DATE.test(date) && date >= today && date <= endDate;
    })
    .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)))[0] || null;
}
