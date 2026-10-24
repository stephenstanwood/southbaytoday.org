// The city's CC0 dataset publishes this CSV download on its public dataset
// page. robots.txt excludes /api/, so neither permit consumer uses CKAN's
// datastore API. Keep the city's download URL; its storage redirect is signed.
// Source review: docs/qa/2026-10-24-0507-fact-check.md.
export const SAN_JOSE_PERMITS_CSV_URL = "https://data.sanjoseca.gov/dataset/2723cdec-a639-4b63-bded-175338c45473/resource/045b3678-e923-4002-b696-300955bc6d06/download/buildingpermits30.csv";

const REQUIRED_COLUMNS = [
  "gx_location", "FOLDERNUMBER", "FOLDERDESC", "FOLDERNAME",
  "WORKDESCRIPTION", "SUBTYPEDESCRIPTION", "ISSUEDATE",
  "DWELLINGUNITS", "PERMITVALUATION",
];

/** Preserve quoted commas, escaped quotes and multiline permit descriptions. */
export function parseSanJosePermitCsv(input) {
  const text = String(input).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], field = "", quoted = false, closedQuote = false;
  const endField = () => { row.push(field); field = ""; closedQuote = false; };
  const endRow = () => {
    endField();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closedQuote = true; }
      else field += c;
    } else if (c === '"') {
      if (field || closedQuote) throw new Error("Malformed San José permit CSV quote");
      quoted = true;
    } else if (c === ",") endField();
    else if (c === "\r" || c === "\n") {
      endRow();
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else {
      if (closedQuote) throw new Error("Unexpected text after San José permit CSV quote");
      field += c;
    }
  }
  if (quoted) throw new Error("Unclosed San José permit CSV quote");
  if (field || row.length || closedQuote) endRow();
  const [headers, ...records] = rows;
  if (!headers || new Set(headers).size !== headers.length
      || REQUIRED_COLUMNS.some((key) => !headers.includes(key))) {
    throw new Error("San José permit CSV is missing required columns");
  }
  if (!records.length) throw new Error("San José permit CSV contains no records");
  return records.map((values) => {
    if (values.length !== headers.length) throw new Error("San José permit CSV row has the wrong column count");
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
}

export async function fetchSanJosePermitRecords({
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  // The shared repo lock serializes scheduled consumers in separate processes.
  // Waiting before each download also honors the host's 10-second crawl delay
  // when the two permit generators run consecutively in one refresh.
  await sleep(10_000);
  const response = await fetchImpl(SAN_JOSE_PERMITS_CSV_URL, {
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`San José permit download HTTP ${response.status}`);
  return parseSanJosePermitCsv(await response.text());
}
