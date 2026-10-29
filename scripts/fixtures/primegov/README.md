These fixtures were captured from Palo Alto's public PrimeGov portal on
October 28, 2026. The HTML preserves the original document title, printed
meeting date, and numbered agenda-item markup, with portal chrome, images,
scripts, styles and attachments removed. The archive retains only the nearby
meeting records and their published document metadata.

- Archive: https://cityofpaloalto.primegov.com/api/v2/PublicPortal/ListArchivedMeetings?year=2026
- Council special meeting, October 26: https://cityofpaloalto.primegov.com/Portal/Meeting?compiledMeetingDocumentFileId=21874
- Stormwater Management Oversight Committee, October 22: https://cityofpaloalto.primegov.com/Portal/Meeting?compiledMeetingDocumentFileId=21819

The Council document's HTML title says October 27 in UTC; its printed agenda
and archive record both say October 26 in Pacific time. The API returns other
committees even when a `committeeId` query parameter is supplied, so consumers
must filter the returned records explicitly.
