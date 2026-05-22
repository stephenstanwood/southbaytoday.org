// Shared display-text cleanup for user-facing cards and generated copy.
// Keeps Latin accents, punctuation, and brand casing; removes CJK/Hangul
// translation fragments that make compact South Bay Today cards hard to scan.

const NON_ENGLISH_SCRIPT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const NON_ENGLISH_SCRIPT_RUN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

const PROPER_ADJECTIVE_FIXES = [
  "American",
  "Argentine",
  "Asian",
  "Brazilian",
  "Burmese",
  "Cambodian",
  "Caribbean",
  "Chinese",
  "Cuban",
  "Egyptian",
  "Ethiopian",
  "European",
  "Filipino",
  "French",
  "German",
  "Greek",
  "Hawaiian",
  "Indian",
  "Italian",
  "Japanese",
  "Korean",
  "Latin",
  "Lebanese",
  "Mediterranean",
  "Mexican",
  "Moroccan",
  "Pakistani",
  "Persian",
  "Peruvian",
  "Polish",
  "Portuguese",
  "Russian",
  "Spanish",
  "Taiwanese",
  "Thai",
  "Turkish",
  "Vietnamese",
];

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]}]+/gi;

function tidyDisplayText(value) {
  return String(value || "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)|（\s*）|\[\s*\]|\{\s*\}/g, "")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s+[-–—]\s*$/g, "")
    .replace(/^[-–—]\s+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function hasNonEnglishScript(value) {
  return NON_ENGLISH_SCRIPT_RE.test(String(value || ""));
}

export function cleanDisplayName(value) {
  if (value === undefined || value === null) return value;
  let t = String(value);
  if (!hasNonEnglishScript(t)) return tidyDisplayText(t);

  t = t
    .replace(/\s*[\(\[\{（【][^)\]\}）】]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}][^)\]\}）】]*[\)\]\}）】]\s*/gu, " ")
    .replace(/\s*[\/|]\s*(?=[^\n\r\/|,;:()]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])(?![^\n\r\/|,;:()]*[A-Za-z])[^\n\r\/|,;:()]*/gu, " ")
    .replace(NON_ENGLISH_SCRIPT_RUN_RE, " ");

  return tidyDisplayText(t);
}

export function cleanDisplayCopy(value) {
  if (value === undefined || value === null) return value;
  let t = String(value);

  if (hasNonEnglishScript(t)) {
    const sentences = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    if (sentences && sentences.length > 1) {
      t = sentences
        .filter((sentence) => {
          if (!hasNonEnglishScript(sentence)) return true;
          return /[A-Za-z]{6,}/.test(sentence);
        })
        .join(" ");
    }
    t = cleanDisplayName(t);
  } else {
    t = tidyDisplayText(t);
  }

  const urls = [];
  t = t.replace(URL_RE, (url) => {
    const token = `__SBT_URL_${urls.length}__`;
    urls.push(url);
    return token;
  });

  for (const word of PROPER_ADJECTIVE_FIXES) {
    const re = new RegExp(`\\b${word.toLowerCase()}\\b`, "g");
    t = t.replace(re, word);
  }

  t = t.replace(/__SBT_URL_(\d+)__/g, (_match, index) => urls[Number(index)] || _match);

  return tidyDisplayText(t);
}
