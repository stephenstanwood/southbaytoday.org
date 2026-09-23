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

export type { DigestData };
