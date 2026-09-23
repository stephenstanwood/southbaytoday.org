interface DigestData {
  city: string;
  cityName: string;
  body: string;
  meetingDate: string;
  meetingDateIso?: string;
  title: string;
  summary: string;
  keyTopics: string[];
  nextMeeting?: string | null;
  // null when the digest covers a committee/commission rather than the council,
  // whose published cadence wouldn't apply.
  schedule: string | null;
  sourceUrl: string;
  generatedAt?: string;
}

interface AgendaItem {
  title: string;
  sequence: number;
}

interface UpcomingMeetingInfo {
  date: string;
  displayDate: string;
  url: string;
  location?: string | null;
  agendaItems?: AgendaItem[];
}

interface Props {
  digest: DigestData;
  onRefresh?: () => void;
  upcomingMeeting?: UpcomingMeetingInfo | null;
}

export default function DigestCard({ digest, onRefresh, upcomingMeeting }: Props) {
  // Prefer real upcoming meeting data over AI-generated text
  const nextLabel = upcomingMeeting
    ? upcomingMeeting.displayDate
    : digest.nextMeeting || null;
  const nextUrl = upcomingMeeting?.url ?? null;
  return (
    <div className="sb-digest-card">
      <div className="sb-digest-header">
        <div className="sb-digest-city">{digest.cityName}</div>
        <div className="sb-digest-body">{digest.body}</div>
      </div>
      <div className="sb-digest-date">{digest.meetingDate}</div>
      {digest.keyTopics.length > 0 && (
        <ul className="sb-digest-topics">
          {digest.keyTopics.map((topic, i) => (
            <li key={i}>{topic}</li>
          ))}
        </ul>
      )}
      {upcomingMeeting?.agendaItems && upcomingMeeting.agendaItems.length > 0 && (
        <div className="sb-digest-agenda">
          <div className="sb-digest-agenda-label">
            On the agenda · {upcomingMeeting.displayDate}
          </div>
          <ul>
            {upcomingMeeting.agendaItems.map((item, i) => (
              <li key={i}>{item.title}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="sb-digest-footer">
        {nextLabel && (
          <span className="sb-digest-next">
            Next meeting:{" "}
            {nextUrl ? (
              <a href={nextUrl} target="_blank" rel="noopener noreferrer">
                {nextLabel}
              </a>
            ) : nextLabel}
          </span>
        )}
        <span className="sb-digest-actions">
          <a
            href={digest.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="sb-digest-source"
          >
            View agenda
          </a>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="sb-btn sb-btn--quiet"
              title="Refresh this digest from the latest agenda"
            >
              ↻ Refresh
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

export type { DigestData };
