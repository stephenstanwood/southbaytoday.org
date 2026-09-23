import { useState, useMemo } from "react";
import {
  CAMPS,
  SUMMER_WEEKS,
  SHORT_WEEK_NUM,
  DATA_VERIFIED_AT,
  type Camp,
  type CampType,
  type CampWeek,
} from "../../../data/south-bay/camps-data";
import PageHero from "../PageHero";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Drop summer weeks that have already ended so the week picker and planner
// never offer a week you can't attend. SignalApp is client:only, so this
// `new Date()` is the viewer's real clock — no SSR/hydration mismatch. Pin the
// date to Pacific anyway: the camps run here, and cityCamps.ts reads the same
// boundary off a PT-pinned TODAY_ISO, so an unpinned viewer clock could put
// the two out of step by a day.
// Once every week is past (summer's over) we fall back to the full set so the
// planner never renders an empty week list.
const TODAY_ISO = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Los_Angeles",
});
const UPCOMING_WEEKS = SUMMER_WEEKS.filter((w) => w.endDate >= TODAY_ISO);
const ACTIVE_WEEKS = UPCOMING_WEEKS.length > 0 ? UPCOMING_WEEKS : SUMMER_WEEKS;
// True while at least one summer week is still ahead. Once summer's fully over
// we stop hiding finished camps so the tab keeps showing the full lineup
// off-season (mirrors the ACTIVE_WEEKS fallback above).
const SEASON_ACTIVE = UPCOMING_WEEKS.length > 0;

const TYPE_FILTERS: { id: CampType | "all"; label: string }[] = [
  { id: "all",       label: "All"       },
  { id: "general",   label: "General"   },
  { id: "sports",    label: "Sports"    },
  { id: "arts",      label: "Arts"      },
  { id: "stem",      label: "STEM"      },
  { id: "nature",    label: "Nature"    },
  { id: "specialty", label: "Specialty" },
  { id: "academic",  label: "Academic"  },
];

const ALL_ORG_TYPES: { id: string; label: string }[] = [
  { id: "all",        label: "All"              },
  { id: "city",       label: "City Programs"    },
  { id: "nonprofit",  label: "Nonprofits"       },
  { id: "private",    label: "Private"          },
  { id: "university", label: "College Programs" },
];

// Singular operator label for a card's kicker line ("SAN JOSE · CITY-RUN").
const ORG_CARD_LABEL: Record<Camp["orgType"], string> = {
  city:       "City-run",
  nonprofit:  "Nonprofit",
  private:    "Private",
  university: "College",
};

const PRICE_TIERS: { id: string; label: string }[] = [
  { id: "all",     label: "All"             },
  { id: "budget",  label: "Budget (<$250)"  },
  { id: "mid",     label: "Mid ($250–$400)" },
  { id: "premium", label: "Premium ($400+)" },
];

const ALL_CITIES = Array.from(new Set(CAMPS.map((c) => c.cityId))).sort();

function getCityLabel(cityId: string): string {
  if (cityId === "multi") return "Multi-city";
  return CAMPS.find((c) => c.cityId === cityId)?.cityName ?? cityId;
}

// Camp has a given week number
function campHasWeek(camp: Camp, weekNum: number): boolean {
  return camp.weeks.some((w) => w.weekNum === weekNum);
}

// Camp still has at least one session a kid could attend. Camps with no dated
// weeks (year-round / undated programs) are always considered current.
function campHasUpcomingWeek(camp: Camp): boolean {
  if (camp.weeks.length === 0) return true;
  return camp.weeks.some((w) => w.endDate >= TODAY_ISO);
}

// Sessions a parent can still register for. During an active season the week
// picker and planner already hide finished weeks, so the card footer should
// match — count only upcoming weeks, not the all-time total. Once the season is
// over (no upcoming weeks) fall back to the full count so the card isn't blank.
function sessionCount(camp: Camp): number {
  const upcoming = camp.weeks.filter((w) => w.endDate >= TODAY_ISO).length;
  return upcoming > 0 ? upcoming : camp.weeks.length;
}

// Get camp week data for a specific week number
function getCampWeek(camp: Camp, weekNum: number): CampWeek | undefined {
  return camp.weeks.find((w) => w.weekNum === weekNum);
}

// Price range label for a camp
function priceRange(camp: Camp): string {
  const prices = camp.weeks
    .map((w) => w.residentPrice)
    .filter((p): p is number => p !== null);
  if (!prices.length) return "Contact for pricing";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `$${min}/wk` : `$${min}–$${max}/wk`;
}

// Weeks label: "Wks 1–8" or similar
function weeksLabel(camp: Camp): string {
  const nums = camp.weeks.map((w) => w.weekNum).sort((a, b) => a - b);
  if (!nums.length) return "";
  if (nums.length === 1) return `Wk ${nums[0]}`;
  return `Wks ${nums[0]}–${nums[nums.length - 1]}`;
}

// Price tier helper
function priceTier(camp: Camp): "budget" | "mid" | "premium" {
  const prices = camp.weeks.map((w) => w.residentPrice).filter((p): p is number => p !== null);
  if (!prices.length) return "mid";
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (avg < 250) return "budget";
  if (avg <= 400) return "mid";
  return "premium";
}

// ---------------------------------------------------------------------------
// Camp card (Browse mode)
// ---------------------------------------------------------------------------

function CampCard({ camp, featured = false }: { camp: Camp; featured?: boolean }) {
  const usefulLocations = camp.locations.filter(
    (loc) => !loc.toLowerCase().startsWith("various")
  );
  const typeLabel = TYPE_FILTERS.find((t) => t.id === camp.type)?.label ?? camp.type;
  const price = priceRange(camp);
  // NBSP before each "·" keeps a wrapped line from starting with a separator.
  const locationLabel = usefulLocations.slice(0, 2).join("\u00a0· ");
  const sessions = sessionCount(camp);

  return (
    <article className={`camps-card${featured ? " camps-card--featured" : ""}`}>
      <header className="camps-card-head">
        <div className="camps-card-kicker">
          {camp.cityName}
          <span className="camps-card-sep">{"\u00a0· "}</span>
          {ORG_CARD_LABEL[camp.orgType] ?? camp.orgType}
        </div>
        <span className="camps-type" data-type={camp.type}>{typeLabel}</span>
      </header>

      <h3 className="camps-card-title">{camp.name}</h3>
      <p className="camps-card-copy">{camp.description}</p>

      <dl className="camps-facts">
        <div>
          <dt>Ages</dt>
          <dd>{camp.ageMin}–{camp.ageMax}</dd>
        </div>
        <div>
          <dt>Weeks</dt>
          <dd>{weeksLabel(camp)}</dd>
        </div>
        <div>
          <dt>{SEASON_ACTIVE ? "Price" : "2026 price"}</dt>
          <dd className={price.startsWith("$") ? "camps-fact-price" : undefined}>{price}</dd>
        </div>
        <div>
          <dt>Hours</dt>
          <dd>{camp.hours}</dd>
        </div>
      </dl>

      {locationLabel && (
        <p className="camps-card-where">
          <span className="camps-card-label">Where</span>
          {locationLabel}
        </p>
      )}

      {camp.tags.length > 0 && (
        <ul className="camps-card-tags" aria-label="Highlights">
          {camp.tags.slice(0, 4).map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}

      {camp.priceNote && <p className="camps-card-note">{camp.priceNote}</p>}

      <footer className="camps-card-footer">
        {!camp.priceNote && (
          <span className="camps-card-sessions">
            {sessions} session{sessions !== 1 ? "s" : ""}{" "}
            {SEASON_ACTIVE ? "listed" : "in 2026"}
          </span>
        )}
        <a
          className="sb-btn camps-card-cta"
          href={camp.registerUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {/* Off-season the last session is already past, so "Register" points at
              a page with nothing to register for. The operator's page is still
              the right destination — it's where next year's dates go up first —
              but the label has to say so. */}
          {SEASON_ACTIVE ? "Register" : "Program page"}
          <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Browse mode
// ---------------------------------------------------------------------------

function BrowseMode() {
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<CampType | "all">("all");
  const [orgTypeFilter, setOrgTypeFilter] = useState<string>("all");
  const [priceTierFilter, setPriceTierFilter] = useState<string>("all");
  const [ageFilter, setAgeFilter] = useState<string>("");
  const [weekFilter, setWeekFilter] = useState<number | "all">("all");
  const [query, setQuery] = useState<string>("");
  const [showAll, setShowAll] = useState(false);

  const featured = useMemo(
    () =>
      CAMPS.filter(
        (camp) => camp.featured && (!SEASON_ACTIVE || campHasUpcomingWeek(camp)),
      ).slice(0, 3),
    [],
  );
  const featuredIds = useMemo(() => new Set(featured.map((camp) => camp.id)), [featured]);

  const hasFilters =
    cityFilter !== "all" ||
    typeFilter !== "all" ||
    orgTypeFilter !== "all" ||
    priceTierFilter !== "all" ||
    ageFilter !== "" ||
    weekFilter !== "all" ||
    query.trim() !== "";

  const clearFilters = () => {
    setCityFilter("all");
    setTypeFilter("all");
    setOrgTypeFilter("all");
    setPriceTierFilter("all");
    setAgeFilter("");
    setWeekFilter("all");
    setQuery("");
    setShowAll(false);
  };

  const filtered = useMemo(() => {
    const age = ageFilter === "" ? null : parseInt(ageFilter);
    const q = query.trim().toLowerCase();
    const results = CAMPS.filter((camp) => {
      if (!hasFilters && featuredIds.has(camp.id)) return false;
      // Hide camps whose every session has already ended (until summer's over,
      // when we fall back to showing the full lineup).
      if (SEASON_ACTIVE && !campHasUpcomingWeek(camp)) return false;
      if (cityFilter !== "all" && camp.cityId !== cityFilter) return false;
      if (typeFilter !== "all" && camp.type !== typeFilter) return false;
      if (orgTypeFilter !== "all" && camp.orgType !== orgTypeFilter) return false;
      if (priceTierFilter !== "all" && priceTier(camp) !== priceTierFilter) return false;
      if (age !== null && Number.isFinite(age) && (camp.ageMin > age || camp.ageMax < age)) return false;
      if (weekFilter !== "all" && !campHasWeek(camp, weekFilter)) return false;
      if (q) {
        const haystack = [
          camp.name,
          camp.cityName,
          camp.description,
          camp.orgType,
          camp.type,
          ...camp.tags,
          ...camp.locations,
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return [...results].sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return a.cityName.localeCompare(b.cityName) || a.name.localeCompare(b.name);
    });
  }, [cityFilter, typeFilter, orgTypeFilter, priceTierFilter, ageFilter, weekFilter, query, hasFilters, featuredIds]);
  const visible = hasFilters || showAll ? filtered : filtered.slice(0, 10);
  const hiddenCount = filtered.length - visible.length;
  // Total of camps still browsable (excludes ones whose every session ended).
  const currentCampsCount = useMemo(
    () => CAMPS.filter((camp) => !SEASON_ACTIVE || campHasUpcomingWeek(camp)).length,
    [],
  );
  const shownTotal = hasFilters ? filtered.length : currentCampsCount;

  return (
    <div className="camps-directory">
      {featured.length > 0 && (
        <section className="camps-featured" aria-labelledby="camps-featured-title">
          <div className="camps-section-head">
            <div>
              <div className="sb-eyebrow camps-kicker">Start here</div>
              <h2 id="camps-featured-title">Strong first picks</h2>
            </div>
            <p>
              {SEASON_ACTIVE
                ? "Broad programs with clear dates, reliable registration links, and enough weeks to anchor a summer plan."
                : "Broad programs with clear dates and reliable registration links. Shortlist these first when next summer's schedules go up."}
            </p>
          </div>
          <div className="camps-feature-grid">
            {featured.map((camp) => (
              <CampCard key={camp.id} camp={camp} featured />
            ))}
          </div>
        </section>
      )}

      <section className="camps-browse" aria-labelledby="camps-browse-title">
        <div className="camps-section-head">
          <div>
            <div className="sb-eyebrow camps-kicker">Directory</div>
            <h2 id="camps-browse-title">Browse the full camp list</h2>
          </div>
          <p>Use one or two filters when you need them. Otherwise the directory stays out of your way.</p>
        </div>

        <div className="camps-toolbar">
          <label className="camps-field camps-field--search">
            <span>Search</span>
            <input
              type="search"
              placeholder="Camp name, city, tag"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <label className="camps-field">
            <span>City</span>
            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
              <option value="all">All cities</option>
              {ALL_CITIES.map((cityId) => (
                <option key={cityId} value={cityId}>{getCityLabel(cityId)}</option>
              ))}
            </select>
          </label>

          {SEASON_ACTIVE && (
            <label className="camps-field">
              <span>Week</span>
              <select
                value={weekFilter === "all" ? "all" : String(weekFilter)}
                onChange={(e) => setWeekFilter(e.target.value === "all" ? "all" : parseInt(e.target.value))}
              >
                <option value="all">All weeks</option>
                {ACTIVE_WEEKS.map((sw) => (
                  <option key={sw.weekNum} value={sw.weekNum}>
                    Week {sw.weekNum} · {sw.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="camps-field">
            <span>Age</span>
            <input
              type="number"
              inputMode="numeric"
              min={4}
              max={17}
              placeholder="Any"
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value)}
            />
          </label>

          <label className="camps-field">
            <span>Focus</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as CampType | "all")}
            >
              {TYPE_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>

          <label className="camps-field">
            <span>Operator</span>
            <select value={orgTypeFilter} onChange={(e) => setOrgTypeFilter(e.target.value)}>
              {ALL_ORG_TYPES.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>

          <label className="camps-field">
            <span>Price</span>
            <select value={priceTierFilter} onChange={(e) => setPriceTierFilter(e.target.value)}>
              {PRICE_TIERS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
        </div>

        {SEASON_ACTIVE && ACTIVE_WEEKS.some((w) => w.weekNum === SHORT_WEEK_NUM) && (
          <p className="camps-toolbar-note">
            * Week {SHORT_WEEK_NUM} is a short week: no camp Fri Jul 3 (July 4th observed).
          </p>
        )}

        <div className="camps-results-head">
          <span aria-live="polite">
            Showing <strong>{visible.length}</strong> of <strong>{shownTotal}</strong> program{shownTotal !== 1 ? "s" : ""}
          </span>
          {hasFilters && (
            <button type="button" className="sb-btn sb-btn--quiet" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="sb-empty camps-empty">
            <h3 className="sb-empty-title">No camps match those filters</h3>
            <p className="sb-empty-sub">Try clearing one field or searching by city instead.</p>
          </div>
        ) : (
          <div className="camps-grid">
            {visible.map((camp) => (
              <CampCard key={camp.id} camp={camp} />
            ))}
          </div>
        )}
        {!hasFilters && hiddenCount > 0 && (
          <button type="button" className="sb-btn camps-show-more" onClick={() => setShowAll(true)}>
            Show all {currentCampsCount} programs
          </button>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summer Builder mode
// ---------------------------------------------------------------------------

interface BuilderSuggestion {
  weekNum: number;
  weekLabel: string;
  options: Array<{ camp: Camp; week: CampWeek }>;
}

function SummerBuilderMode() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [childAges, setChildAges] = useState<string[]>([""]);
  const [selectedWeeks, setSelectedWeeks] = useState<Set<number>>(new Set());

  const toggleWeek = (weekNum: number) => {
    setSelectedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekNum)) next.delete(weekNum);
      else next.add(weekNum);
      return next;
    });
  };

  const addChild = () => setChildAges((prev) => [...prev, ""]);
  const updateChild = (idx: number, val: string) => {
    setChildAges((prev) => prev.map((v, i) => (i === idx ? val : v)));
  };
  const removeChild = (idx: number) => {
    setChildAges((prev) => prev.filter((_, i) => i !== idx));
  };

  const parsedAges = childAges
    .map((a) => (a !== "" ? parseInt(a) : null))
    .filter((a): a is number => a !== null && a >= 4 && a <= 17);

  const allAgesValid = parsedAges.length > 0 && parsedAges.length === childAges.filter((a) => a !== "").length;

  const suggestions = useMemo((): BuilderSuggestion[] => {
    if (parsedAges.length === 0) return [];
    const sorted = Array.from(selectedWeeks).sort((a, b) => a - b);
    return sorted.map((weekNum) => {
      // Camp must work for ALL entered ages
      const matchingCamps = CAMPS.filter((camp) =>
        parsedAges.every((age) => age >= camp.ageMin && age <= camp.ageMax) &&
        campHasWeek(camp, weekNum)
      );
      const options = matchingCamps
        .map((camp) => ({ camp, week: getCampWeek(camp, weekNum)! }))
        .sort((a, b) => {
          const pa = a.week.residentPrice ?? 9999;
          const pb = b.week.residentPrice ?? 9999;
          if (pa !== pb) return pa - pb;
          return a.camp.cityName.localeCompare(b.camp.cityName);
        })
        .slice(0, 3);
      return { weekNum, weekLabel: SUMMER_WEEKS.find((sw) => sw.weekNum === weekNum)?.label ?? `Week ${weekNum}`, options };
    });
  }, [parsedAges.join(","), selectedWeeks]);

  const suggestedPlan = useMemo(() => {
    return suggestions
      .filter((s) => s.options.length > 0)
      .map((s) => ({ ...s.options[0], weekNum: s.weekNum, weekLabel: s.weekLabel }));
  }, [suggestions]);

  const totalCost = useMemo(() => {
    return suggestedPlan.reduce((sum, item) => {
      return sum + (item.week.residentPrice ?? 0);
    }, 0);
  }, [suggestedPlan]);

  // Mix-it-up suggestion: if 3+ weeks all same type, suggest mixing
  const mixItUpSuggestion = useMemo(() => {
    if (suggestedPlan.length < 3) return null;
    const types = suggestedPlan.map((item) => item.camp.type);
    const firstType = types[0];
    if (types.every((t) => t === firstType)) {
      const otherTypes: CampType[] = ["general", "sports", "arts", "stem", "nature", "specialty", "academic"];
      const alternatives = otherTypes.filter((t) => t !== firstType);
      const suggestion = alternatives[0];
      return { dominantType: firstType, suggestedType: suggestion };
    }
    return null;
  }, [suggestedPlan]);

  const handleReset = () => {
    setStep(1);
    setChildAges([""]);
    setSelectedWeeks(new Set());
  };

  // Step 1: Age(s)
  if (step === 1) {
    return (
      <div className="camps-builder-start">
        <div className="camps-builder-emoji" aria-hidden="true">🏕️</div>
        <h2 className="camps-builder-title">Build your child's summer</h2>
        <p className="camps-builder-lede">
          Tell us your children's ages and which weeks you need coverage, and we'll put together a suggested camp plan with estimated costs.
        </p>

        <fieldset className="camps-builder-ages">
          <legend className="camps-builder-label">Children's ages</legend>
          <div className="camps-builder-age-list">
            {childAges.map((age, idx) => (
              <div key={idx} className="camps-builder-age-row">
                <input
                  className="camps-builder-age-input"
                  type="number"
                  inputMode="numeric"
                  min={4}
                  max={17}
                  placeholder="Age (4–17)"
                  aria-label={`Child ${idx + 1} age`}
                  value={age}
                  onChange={(e) => updateChild(idx, e.target.value)}
                />
                {childAges.length > 1 && (
                  <button
                    type="button"
                    className="camps-builder-remove"
                    onClick={() => removeChild(idx)}
                    aria-label={`Remove child ${idx + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="camps-builder-add" onClick={addChild}>
              + Add another child
            </button>
          </div>
          {parsedAges.length > 1 && (
            <p className="camps-builder-hint">
              Will show camps that work for all {parsedAges.length} ages simultaneously.
            </p>
          )}
        </fieldset>

        <button
          type="button"
          className="sb-btn sb-btn--primary camps-builder-cta"
          onClick={() => allAgesValid && setStep(2)}
          disabled={!allAgesValid}
        >
          Next: Pick your weeks →
        </button>
      </div>
    );
  }

  // Step 2: Week selection
  if (step === 2) {
    const ageLabel = parsedAges.length === 1
      ? `Age ${parsedAges[0]}`
      : `Ages ${parsedAges.join(", ")}`;
    const allWeeksSelected = ACTIVE_WEEKS.every((sw) => selectedWeeks.has(sw.weekNum));

    return (
      <div>
        <div className="camps-builder-bar">
          <button type="button" className="camps-builder-back" onClick={() => setStep(1)}>
            ← Back
          </button>
          <span className="camps-builder-agetag">{ageLabel}</span>
        </div>
        <h2 className="camps-builder-title">Which weeks need coverage?</h2>
        <p className="camps-builder-lede">
          Select the weeks you need a camp for.
          {SEASON_ACTIVE && ACTIVE_WEEKS.some((w) => w.weekNum === SHORT_WEEK_NUM) &&
            ` Week ${SHORT_WEEK_NUM} is a short week (Fri Jul 3 is the observed July 4th holiday).`}
        </p>
        <button
          type="button"
          className={`camps-builder-selectall${allWeeksSelected ? " is-active" : ""}`}
          onClick={() => {
            const allNums = ACTIVE_WEEKS.map(sw => sw.weekNum);
            const allSelected = allNums.every(n => selectedWeeks.has(n));
            setSelectedWeeks(allSelected ? new Set() : new Set(allNums));
          }}
        >
          {allWeeksSelected ? "Clear all" : `Select all ${ACTIVE_WEEKS.length} weeks`}
        </button>

        <div className="camps-week-grid">
          {ACTIVE_WEEKS.map((sw) => {
            const selected = selectedWeeks.has(sw.weekNum);
            return (
              <button
                type="button"
                key={sw.weekNum}
                className={`camps-week${selected ? " is-selected" : ""}`}
                aria-pressed={selected}
                onClick={() => toggleWeek(sw.weekNum)}
              >
                <span className="camps-week-num">Week {sw.weekNum}</span>
                <span className="camps-week-dates">{sw.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="sb-btn sb-btn--primary camps-builder-cta"
          onClick={() => selectedWeeks.size > 0 && setStep(3)}
          disabled={selectedWeeks.size === 0}
        >
          See my plan ({selectedWeeks.size} week{selectedWeeks.size !== 1 ? "s" : ""}) →
        </button>
      </div>
    );
  }

  // Step 3: Results
  const weeksWithNoCamps = suggestions.filter((s) => s.options.length === 0);
  const ageLabel = parsedAges.length === 1
    ? `Age ${parsedAges[0]}`
    : `Ages ${parsedAges.join(", ")}`;

  return (
    <div>
      <div className="camps-builder-bar">
        <button type="button" className="camps-builder-back" onClick={() => setStep(2)}>
          ← Back
        </button>
        <h2 className="camps-builder-title camps-builder-title--inline">Your Summer Plan</h2>
        <span className="camps-builder-agetag camps-builder-agetag--end">{ageLabel}</span>
      </div>

      {/* Suggested plan summary */}
      {suggestedPlan.length > 0 && (
        <div className="camps-plan">
          <div className="camps-plan-label">Suggested plan · Lowest cost</div>
          <ul className="camps-plan-list">
            {suggestedPlan.map((item) => (
              <li key={item.weekNum} className="camps-plan-row">
                <span className="camps-plan-wk">Wk {item.weekNum}</span>
                <span className="camps-plan-name">{item.camp.name}</span>
                <span className="camps-plan-price">
                  {item.week.residentPrice !== null ? `$${item.week.residentPrice}` : "—"}
                </span>
              </li>
            ))}
          </ul>
          <div className="camps-plan-total">
            <span>Estimated total</span>
            <span>${totalCost}</span>
          </div>
          <p className="camps-plan-note">
            Resident prices shown. Verify all prices at each program's website.
          </p>
        </div>
      )}

      {/* Mix it up suggestion */}
      {mixItUpSuggestion && (
        <div className="camps-plan-tip">
          💡 Your plan is all <strong>{mixItUpSuggestion.dominantType}</strong> camps. Consider mixing in a <strong>{mixItUpSuggestion.suggestedType}</strong> week for variety.
        </div>
      )}

      {/* Week-by-week options */}
      {suggestions.map((suggestion) => (
        <div key={suggestion.weekNum} className="camps-plan-week">
          <div className="camps-plan-week-head">
            <span className="camps-plan-week-badge">Week {suggestion.weekNum}</span>
            <span className="camps-plan-week-dates">{suggestion.weekLabel}</span>
            {suggestion.options.length === 0 && (
              <span className="camps-plan-week-none">No matches found</span>
            )}
          </div>

          {suggestion.options.length === 0 ? (
            <p className="camps-plan-week-empty">
              No camps found for {ageLabel} in week {suggestion.weekNum}. Try checking individual city websites.
            </p>
          ) : (
            <div className="camps-plan-options">
              {suggestion.options.map((opt, idx) => {
                const isTop = idx === 0;
                return (
                  <div key={opt.camp.id} className={`camps-option${isTop ? " is-top" : ""}`}>
                    {isTop && <span className="camps-option-badge">Best pick</span>}
                    <div className="camps-option-body">
                      <div className="camps-option-name">{opt.camp.name}</div>
                      <div className="camps-option-meta">
                        {opt.camp.cityName}{"\u00a0· "}Ages {opt.camp.ageMin}–{opt.camp.ageMax}{"\u00a0· "}{opt.camp.hours}
                      </div>
                    </div>
                    <div className="camps-option-price">
                      <strong>
                        {opt.week.residentPrice !== null ? `$${opt.week.residentPrice}` : "Contact"}
                      </strong>
                      <span>resident</span>
                    </div>
                    {isTop && (
                      <a
                        className="sb-btn camps-option-cta"
                        href={opt.camp.registerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Register <span aria-hidden="true">↗</span>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {weeksWithNoCamps.length > 0 && (
        <div className="camps-plan-warn">
          Some weeks have no matching camps in our database. Check individual city recreation sites for the latest listings.
        </div>
      )}

      <div className="camps-builder-actions">
        <button type="button" className="sb-btn sb-btn--quiet" onClick={handleReset}>
          Start over
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function CampsView() {
  // The week-by-week planner only means anything while there are weeks left to
  // cover. Once the last 2026 session ends it would walk a parent through
  // picking expired weeks, so off-season the tab is the directory alone.
  const [mode, setMode] = useState<"browse" | "builder">("browse");
  const cityProgramCount = CAMPS.filter((camp) => camp.orgType === "city").length;
  const nonprofitCount = CAMPS.filter((camp) => camp.orgType === "nonprofit").length;

  const verifiedDisplay = new Date(DATA_VERIFIED_AT + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="camps-view">
      <PageHero
        eyebrow={SEASON_ACTIVE ? "South Bay / Summer 2026" : "South Bay / Planning Ahead"}
        title="Summer Camps"
        description={
          SEASON_ACTIVE
            ? "A calmer guide to city rec programs, specialty camps, sports academies, arts programs, and STEM weeks across the South Bay. Every listing links back to the operator's registration page."
            : "The 2026 season has wrapped, so this is the shortlist for next year: city rec programs, specialty camps, sports academies, arts programs, and STEM weeks across the South Bay. Every listing still links to the operator's own page, which is where new dates and registration go up first."
        }
        note={`Links verified ${verifiedDisplay}`}
        accent="#B45309"
        stats={[
          { value: CAMPS.length, label: "Programs" },
          { value: SUMMER_WEEKS.length, label: SEASON_ACTIVE ? "Summer weeks" : "Weeks in 2026" },
          { value: cityProgramCount, label: "City-run options" },
          { value: nonprofitCount, label: "Nonprofit options" },
        ]}
      />

      {SEASON_ACTIVE && (
        <div className="camps-mode-switch" role="tablist" aria-label="Camp view">
          <button
            type="button"
            id="camps-tab-browse"
            role="tab"
            onClick={() => setMode("browse")}
            className={mode === "browse" ? "is-active" : ""}
            aria-selected={mode === "browse"}
            aria-controls="camps-panel-browse"
          >
            Directory
          </button>
          <button
            type="button"
            id="camps-tab-builder"
            role="tab"
            onClick={() => setMode("builder")}
            className={mode === "builder" ? "is-active" : ""}
            aria-selected={mode === "builder"}
            aria-controls="camps-panel-builder"
          >
            Plan Weeks
          </button>
        </div>
      )}

      {!SEASON_ACTIVE || mode === "browse" ? (
        // Off-season there is no tablist above, so the panel is a plain region —
        // pointing aria-labelledby at a button that isn't rendered would leave
        // the directory unlabeled for screen readers.
        <div
          id="camps-panel-browse"
          role={SEASON_ACTIVE ? "tabpanel" : undefined}
          aria-labelledby={SEASON_ACTIVE ? "camps-tab-browse" : undefined}
        >
          <BrowseMode />
        </div>
      ) : (
        <section id="camps-panel-builder" role="tabpanel" aria-labelledby="camps-tab-builder" className="camps-builder-wrap">
          <SummerBuilderMode />
        </section>
      )}
    </div>
  );
}
