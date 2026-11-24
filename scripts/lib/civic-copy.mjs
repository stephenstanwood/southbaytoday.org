// A full month-day-year date needs a closing comma when prose continues.
// Apply only to summaries/topics, keeping headings and structured dates exact.
const FULL_DATE_IN_PROSE = /\b((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4})(?= [A-Za-z])/g;

// Hyphenate area modifiers only before building nouns. Measurements such as
// "1,360 square feet" and "1 square foot per resident" must stay unchanged.
const SQUARE_FOOT_MODIFIER = /\b(\d[\d,]*(?:\.\d+)?) square foot (?=(?:apartment|building|duplex|facility|home|house|office|warehouse)\b)/g;

function correctCampbellTechParkCopy(text, cityId) {
  // Campbell Tech Park MMRP (September 22, 2026), MM TRANS-1, printed p. 6:
  // https://files.ceqanet.lci.ca.gov/310279-4/attachment/tOj7zYwWQUM8M0_NzkE-L6HSWqPEnD63mOmfrMIjFv19ogX-e1K6jaRB7AfALPtLxr5CrqKieBeqQzWj0
  // It names Parkway / East McGlincy Lane and also requires ramps, driveway
  // markings and access easements. Scope the two erroneous phrases to this city.
  return cityId === "campbell"
    ? text.replace("Campbell Technology Park homes: traffic fixes limited to crosswalks, no vehicle mitigation",
      "Campbell Technology Park housing plan includes pedestrian crossing upgrades")
      .replace("The only required mitigation is a mid-block crosswalk and an upgraded crossing on Campbell Technology Park and McGlinchey Lane.",
        "Required transportation measures include a mid-block crosswalk on Campbell Technology Parkway and another at East McGlincy Lane.")
    : text;
}

// These are compound modifiers only in the named civic phrases. Reuse them
// for headlines without applying prose-only date commas to a heading.
export function polishCivicModifiers(text, { cityId } = {}) {
  return typeof text === "string"
    ? correctCampbellTechParkCopy(text, cityId).replace(/\bbelow market rate (?=in-lieu fees?\b|ownership housing requirement\b)/g, "below-market-rate ")
      .replace(/\bsquare footage-based fee\b/g, "square-footage-based fee")
      .replace(/\bCity Council sponsored special event\b/g, "City Council-sponsored special event")
      .replace(/\bHistoric-listed home\b/g, "Home listed as historic")
      .replace(/\bHistoric-listed Washington Street lot\b/g, "Washington Street lot listed as historic")
    : text;
}

export function polishCivicCopy(text, { cityId } = {}) {
  return typeof text === "string"
    ? polishCivicModifiers(text, { cityId }).replace(FULL_DATE_IN_PROSE, "$1,").replace(SQUARE_FOOT_MODIFIER, "$1-square-foot ")
      .replace(/\bA Oct\. (?=\d{1,2}\b)/g, "An Oct. ")
      .replace(/\bwith up to (\d+(?:\.\d+)?%) for construction contingency(?=\.|$)/g, "with a construction contingency of up to $1")
      .replace("Hangul Day/Korean National Foundation Day", "Hangul Day / Korean National Foundation Day")
      .replace("take part: in-person, online, and written public comment", "take part: in person, online, and through written public comment")
      .replace("The source for the November 2, 2026, Campbell City Council meeting is a video transcript, so this describes what the transcript shows was before the Council.",
        "A video transcript shows what was before the Campbell City Council at its November 2, 2026, meeting.")
      .replace("increase fence/wall height", "increase fence and wall height")
      .replace("as a 'builder's remedy' project", "as a \"builder's remedy\" project")
      .replace("state 'builder's remedy' law", "state \"builder's remedy\" law")
      .replace(/(\bchanges to Council Policy \d+, on how items get added to council agendas, which) was deferred\b/g, "$1 were deferred")
      .replace("The commission was asked to recommend approval to the City Council, tentatively set for December 1, 2026.",
        "The commission was asked to recommend approval to the City Council. The council was tentatively scheduled to take up the request on December 1, 2026.")
      .replace("for a 251-unit residential development at 10333 N. Wolfe Road, applicant Eden Housing.",
        "for Eden Housing's proposed 251-unit residential development at 10333 N. Wolfe Road.")
      .replace("along the western and part of the southern property lines.",
        "along the western property line and part of the southern property line.")
      .replace("Staff said the project would add about 1,368 net daily trips, new crosswalks near Campbell Technology Parkway and McGlincy Lane are required, and a separate city restriping project at Camden and White Oaks was discussed.",
        "Staff said the project would add about 1,368 net daily trips and require new crosswalks near Campbell Technology Parkway and McGlincy Lane. Discussion also covered a separate city restriping project at Camden and White Oaks.")
      .replace("one councilmember said she supported it but wants the program's effectiveness reviewed more closely.",
        "one councilmember said she supported it but wanted the program's effectiveness reviewed more closely.")
      .replace("Announcements: Election Day was the next day (Nov. 3; polls open 7 a.m.–8 p.m., mailed ballots must be postmarked by Nov. 3), the city has openings on boards and commissions, and a Veterans Day ceremony is set for Nov. 11 at 9 a.m. on the Orchard City Green.",
        "Announcements covered Election Day on Nov. 3, openings on city boards and commissions, and a Veterans Day ceremony scheduled for Nov. 11 at 9 a.m. on the Orchard City Green. Poll hours were 7 a.m. to 8 p.m., and mailed ballots needed a Nov. 3 postmark.")
      .replace("any further work it wants done on a potential annexation", "any further work it wanted done on a potential annexation")
      .replace("Saratoga Village economic vitality update, including ideas gathered through community engagement, with Council invited to give staff additional direction; also on the agenda was a ceremonial recognition of",
        "The agenda included a Saratoga Village economic vitality update with ideas from community engagement and an invitation for the Council to give staff additional direction. It also listed ceremonial recognition of")
      // Item ROGC 26-395 of the November 18 committee agenda uses the
      // November 24 date for the City Council agenda under review.
      .replace(/(?:The November 24, 2026, final agenda (?:item|review) was marked|The agenda (?:showed|marked) the November 24, 2026, final agenda review as) cancell?ed(?:\.|$)/g,
        (original) => cityId === "san-jose"
          ? "The agenda listed the committee's review of the November 24, 2026, City Council agenda as canceled."
          : original)
      .replace("Also listed were several council-sponsored community events seeking approval to spend city funds and accept donations, and a proposal to establish the La Avenida Cultural District.",
        "The agenda also listed a proposal to establish the La Avenida Cultural District and requests to spend city funds and accept donations for several council-sponsored community events.")
      .replace("to irrigate nonfunctional turfgrass, and updating the recycled water service area",
        "to irrigate nonfunctional turfgrass and updating the recycled water service area")
      .replace("and considering an RV permit parking program on Caribbean Drive along with studying a safe parking pilot",
        "considering an RV permit parking program on Caribbean Drive, and studying a safe parking pilot")
      .replace("increasing the City Attorney salary range.", "increasing the City Attorney's salary range.")
      .replace("a public hearing on a recommendation for a General Plan amendment and rezone at 400 Saratoga Avenue.",
        "a public hearing on whether to recommend amending the General Plan and rezoning 400 Saratoga Avenue.")
      .replace("The proposal would build a five-story, 316-unit apartment building, reconfigure the existing nine-hole golf course, and dedicate land for a public park.",
        "The proposal calls for constructing a five-story, 316-unit apartment building, reconfiguring the existing nine-hole golf course, and dedicating land for a public park.")
      .replace("It also listed updates to Council Policy 030, on adding an item to the agenda, which had been deferred from June 1.",
        "It also listed updates to Council Policy 030, which governs how items are added to the agenda. Consideration of those updates had been deferred from June 1.")
      .replace("a 590-unit residential and 15,000 square-foot commercial mixed-use project at 2610 El Camino Real, which falls under SB 330.",
        "a mixed-use project at 2610 El Camino Real with 590 residential units and 15,000 square feet of commercial space. The project falls under SB 330.")
      .replace("a 590-unit residential and 15,000-square-foot commercial mixed-use project at 2610 El Camino Real",
        "a mixed-use project at 2610 El Camino Real with 590 residential units and 15,000 square feet of commercial space")
      .replace("an affordable housing proposal request for 340 Portage Avenue", "a request for affordable housing proposals at 340 Portage Avenue")
      .replace("The agenda listed authorizing a Request for Proposals and a local funding contribution",
        "The agenda listed a proposal to authorize a request for proposals and a local funding contribution")
      .replace("change its North Ventura area plan designation, to match the adjacent 2951 El Camino Real parcel and add it as a housing inventory site.",
        "change its North Ventura area plan designation to match the adjacent parcel at 2951 El Camino Real and add the Olive Avenue parcel as a housing inventory site.")
      .replace("medium-density mixed use and change its North Ventura area plan designation to match the adjacent parcel at 2951 El Camino Real and add the Olive Avenue parcel as a housing inventory site.",
        "medium-density mixed use, change its North Ventura area plan designation to match the zoning of the adjacent parcel at 2951 El Camino Real, and add the Olive Avenue parcel as a housing inventory site.")
      .replace("medium-density mixed use, change its North Ventura area plan designation to match the zoning of the adjacent parcel at 2951 El Camino Real, and add the Olive Avenue parcel as a housing inventory site.",
        "medium-density mixed use and change its North Ventura Coordinated Area Plan designation to match the zoning of the adjacent parcel at 2951 El Camino Real. The changes would support city staff's determination to add the property to the housing inventory.")
    : text;
}

export function polishCivicTopic(text, options) {
  let copy = polishCivicCopy(text, options);
  // The April 21 staff report names the curb, gutter and sidewalk project
  // whose abbreviated title came through the November 17 agenda extract.
  // https://meetings.municode.com/adaHtmlDocument/index?cc=LOSGATOS&ip=True&me=3423e578564544c4b346a056e5fd6d16
  if (options?.cityId === "los-gatos" && typeof copy === "string") {
    copy = copy.replace(/\b2026 Annual Curb project\b/i, "2026 Annual Curb, Gutter, and Sidewalk Maintenance Project");
  }
  // San José agenda item ROGC 26-404 names District 1 and Councilmember Kamei.
  // https://sanjose.legistar.com/LegislationDetail.aspx?GUID=944C7922-21AF-4970-8270-CDE7733FDE83&ID=8321451
  if (options?.cityId === "san-jose" && typeof copy === "string") {
    if (/\bHoliday Children Book Drive\b/i.test(copy)) {
      copy = copy.replace(/\bDistrict 11\b(?= \(Kamei\))/i, "District 1")
        .replace(/^Council District 6 \(Mulcahy\) had an item seeking retroactive approval and approval of various council-sponsored events, and District 1 \(Kamei\) had an item seeking approval of a proclamation and a Holiday Children Book Drive event\.?$/,
          "Council District 6 (Mulcahy) sought approval for several council-sponsored events, including retroactive approval for some. District 1 (Kamei) sought approval for the Holiday Children Book Drive and its proclamation.");
    }
    copy = copy.replace(/^(Council District 9 \(Foley\) and District 7 \(Doan\) each had an item seeking retroactive approval of a Senior Symposium and a bus visit to the Vietnam Traveling Memorial Wall, respectively, as council-sponsored events using city funds and donated materials and services)$/,
      "$1.");
    // ROGC 26-401's memo names Mahan as mayor among the coauthors.
    // https://sanjose.legistar.com/LegislationDetail.aspx?GUID=FB19D4A3-98DC-4079-885F-6304FD5A573B&ID=8319511
    if (copy.includes("La Avenida Cultural District")) {
      copy = copy.replace("Councilmembers Ortiz, Mahan, Campos, Tordillos, and Candelas",
        "Mayor Mahan and Councilmembers Ortiz, Campos, Tordillos, and Candelas");
    }
  }
  // Finish declarative topic sentences, leaving agenda-title fragments alone.
  // Never append punctuation to a URL or email address.
  if (typeof copy !== "string"
    || !/^(?:The (?:agenda|consent calendar) (?:also )?(?:listed|included)\b|A (?:revised [^.!?]+|Council request|proclamation [^.!?]+) was listed\b)/i.test(copy)
    || /[.!?]["')\]]*$/.test(copy)
    || /[;:,—–-]\s*$/.test(copy)
    || /https?:\/\/\S+$|\b[\w.+-]+@[\w.-]+$/.test(copy)) return copy;
  return `${copy}.`;
}
