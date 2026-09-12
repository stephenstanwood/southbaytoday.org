// Stoa's excerpt is a 500-character search-card preview. Prefer the ingested
// agenda for BOTH attribution and summarization so they read the same source.
export function agendaTextForMeeting(meeting) {
  return meeting.fullAgendaText?.trim() || meeting.excerpt || "";
}
