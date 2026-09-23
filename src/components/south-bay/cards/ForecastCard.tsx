import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import type { City } from "../../../lib/south-bay/types";

type ForecastDay = {
  date: string;
  emoji: string;
  desc: string;
  high: number;
  low: number;
  rainPct: number;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SKELETON_DAYS = 5;

interface Props {
  homeCity: City | null;
}

function ptTodayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

// Colors verified >=4.5:1 against the composited warm page bg (#fbf1e6),
// not just white — the earlier palette read fine on white but two bands
// dropped as low as 2.85:1 once composited over the warm gradient. The
// hottest two bands also moved off true red per house style (no red UI;
// amber/rust ok) onto a rust tone that still reads hottest in the ramp.
function tempColor(t: number): string {
  if (t >= 95) return "#8B3A0F";
  if (t >= 85) return "#A8460C";
  if (t >= 75) return "#9C5504";
  if (t >= 65) return "#456F0C";
  if (t >= 55) return "#0270AA";
  return "#4F46E5";
}

// Today's cell gets a faint wash of its own temperature color.
function tempTint(t: number): string {
  if (t >= 95) return "rgba(139,58,15,0.08)";
  if (t >= 85) return "rgba(168,70,12,0.08)";
  if (t >= 75) return "rgba(156,85,4,0.08)";
  if (t >= 65) return "rgba(69,111,12,0.08)";
  if (t >= 55) return "rgba(2,112,170,0.08)";
  return "rgba(79,70,229,0.08)";
}

export default function ForecastCard({ homeCity }: Props) {
  const [forecast, setForecast] = useState<ForecastDay[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [todayISO, setTodayISO] = useState<string>(() => ptTodayISO());

  // Roll the PT date forward once per minute so a tab left open past
  // midnight refetches the forecast (dropping yesterday, marking the
  // new day as TODAY).
  useEffect(() => {
    const id = setInterval(() => {
      const next = ptTodayISO();
      setTodayISO((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const cityParam = homeCity ? `?city=${homeCity}` : "";
    fetch(`/api/weather${cityParam}`)
      .then((r) => r.json())
      .then((d) => {
        const next: ForecastDay[] | null = d.forecast ?? null;
        setForecast(next);
        setFailed(!next || next.length === 0);
      })
      .catch(() => setFailed(true));
  }, [homeCity, todayISO]);

  // Until the forecast lands, hold its exact footprint with a skeleton so
  // the page below doesn't jump. A failed fetch (or an empty forecast)
  // collapses the strip entirely.
  if (!forecast || forecast.length === 0) {
    if (failed) return null;
    return (
      <div className="sbt-fc" aria-hidden="true" style={{ "--sbt-fc-n": SKELETON_DAYS } as CSSProperties}>
        {Array.from({ length: SKELETON_DAYS }, (_, i) => (
          <div key={i} className="sbt-fc-day">
            <span className="sbt-fc-label"><span className="sbt-fc-sk" style={{ width: 30 }} /></span>
            <div className="sbt-fc-main">
              <span className="sbt-fc-icon"><span className="sbt-fc-sk sbt-fc-sk--icon" /></span>
              <span className="sbt-fc-hi"><span className="sbt-fc-sk" style={{ width: 44 }} /></span>
            </div>
            <div className="sbt-fc-sub">
              <span className="sbt-fc-lo"><span className="sbt-fc-sk" style={{ width: 24 }} /></span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <ul
      className="sbt-fc"
      aria-label={`${forecast.length}-day forecast`}
      style={{ "--sbt-fc-n": forecast.length } as CSSProperties}
    >
      {forecast.map((day) => {
        const isToday = day.date === todayISO;
        const d = new Date(day.date + "T12:00:00");
        const label = isToday ? "Today" : DAY_LABELS[d.getDay()];
        const hasRainEmoji = /🌦|🌧|⛈|🌨/.test(day.emoji);
        const showRain = day.rainPct >= 20 || hasRainEmoji;
        const spoken = `${isToday ? "Today" : DAY_NAMES[d.getDay()]}: ${day.desc || "forecast"}, high ${day.high}°, low ${day.low}°${showRain ? `, ${day.rainPct}% chance of rain` : ""}`;
        return (
          <li
            key={day.date}
            className={`sbt-fc-day${isToday ? " sbt-fc-day--today" : ""}`}
            style={{ "--sbt-fc-color": tempColor(day.high), "--sbt-fc-tint": tempTint(day.high) } as CSSProperties}
          >
            <span className="sbt-sr">{spoken}</span>
            <span className="sbt-fc-label" aria-hidden="true">{label}</span>
            <div className="sbt-fc-main" aria-hidden="true">
              <span className="sbt-fc-icon" title={day.desc || undefined}>{day.emoji}</span>
              <span className="sbt-fc-hi">{day.high}°</span>
            </div>
            <div className="sbt-fc-sub" aria-hidden="true">
              <span className="sbt-fc-lo">{day.low}°</span>
              {showRain && <span className="sbt-fc-rain">💧{day.rainPct}%</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
