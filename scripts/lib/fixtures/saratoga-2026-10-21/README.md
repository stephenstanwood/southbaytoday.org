# Saratoga winter event feed

Captured October 21, 2026 from the City of Saratoga public iCal feed:
https://www.saratoga.ca.us/common/modules/iCalendar/iCalendar.aspx?catID=35&feed=calendar

SHA-256: `23df659ae2d3ae3229656cbff8e93217dd54217ff459f53782430f9c2ce562ac`. The JSON fixture wraps the original response in `body`, preserving its CRLF line endings and line folds without trailing-whitespace changes from Git. The hash applies to the decoded `body` bytes.

UIDs 2690, 2686, 2681, 2687, 2698, 2696 and 2697 are winter occurrences, including November 1 after the DST transition. All use `TZID=America/Los_Angeles`. The previous fixed PDT parser shifted each winter occurrence an hour early. The source occurrence pages corroborate their starts.

UID 2681 supplies a 23:59 end marker while its detail page publishes only the 6:30 PM start. The dated shared-facts correction omits that unsupported end from published records; the parser test preserves the raw feed value before correction.
