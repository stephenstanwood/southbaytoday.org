# Milpitas council agenda, October 20, 2026

Captured October 21, 2026, at 18:10 UTC from the city's CivicClerk service.
`event.json` is the unmodified event 2944 row from the council events response.
`agenda.txt` is the complete plain-text conversion of its published agenda,
file 5631, with line endings and trailing whitespace normalized. It includes
the closed-session recess and the public `C1.`–`C5.` / `6.`–`8.` outline.

- Event: https://milpitasca.portal.civicclerk.com/event/2944/files
- Agenda: https://milpitasca.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=5631,plainText=true)
- Original response SHA-256: `8e997bf9f3b906e62049738cf82b3fb48bd0d54b2666f8bb99eb5e8083bed2ba`

Before the repair, `ADJOURN TO CLOSED SESSION` ended the parsed body before
any public business. The consent-item prefix and wrapped staff-contact titles
also require parsing. These fixtures exercise the actual source format;
recommendations do not establish votes or adopted actions.
