import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { newsletterPageType, type NewsletterContext } from "../../lib/south-bay/newsletterFunnel";

type Status = "idle" | "submitting" | "success" | "error";

export default function NewsletterSignup({
  variant = "card",
}: {
  variant?: "card" | "inline" | "minimal";
}) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const seen = useRef(false);

  function analyticsContext(): NewsletterContext | null {
    if (location.search.includes("notrack")) return null;
    try { if (localStorage.getItem("notrack")) return null; } catch { /* Storage may be blocked. */ }
    return { pageType: newsletterPageType(location.pathname), placement: variant };
  }

  function trackStage(name: string, extra: Record<string, string> = {}) {
    const context = analyticsContext();
    if (!context || website.trim()) return;
    try { track(name, { ...context, ...extra }); } catch { /* Analytics never blocks signup. */ }
  }

  useEffect(() => {
    const form = formRef.current;
    if (!form || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!seen.current && entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
        seen.current = true;
        trackStage("Newsletter signup seen");
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(form);
    return () => observer.disconnect();
  }, [variant]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === "submitting") return;
    setStatus("submitting");
    setError(null);
    trackStage("Newsletter signup submitted");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website, analytics: analyticsContext() }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
        setError(data.error || "Something went wrong");
        trackStage("Newsletter signup error", { reason: `http-${res.status}` });
      }
    } catch {
      setStatus("error");
      setError("Network error — try again");
      trackStage("Newsletter signup error", { reason: "network" });
    }
  }

  const isCard = variant === "card";
  const isMinimal = variant === "minimal";

  // Honeypot: off-screen rather than display:none, because some bots skip
  // hidden inputs. A person never reaches it (aria-hidden, tabIndex -1), so a
  // filled value means automation and the server silently drops the signup.
  const honeypot = (
    <input
      type="text"
      name="website"
      value={website}
      onChange={(e) => setWebsite(e.target.value)}
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
    />
  );

  if (status === "success") {
    if (isMinimal) {
      return (
        <div className="sbt-nl-min-done" role="status">
          📬 Check your email to confirm.
        </div>
      );
    }
    return (
      <div className={isCard ? "sbt-nl-card sbt-nl-done" : "sbt-nl-done"} role="status">
        <p className="sbt-nl-done-title">Almost there. 📬</p>
        <p className="sbt-nl-done-text">
          Check your inbox for a confirmation link. Click it and the first plan lands at 6:00&nbsp;AM.
        </p>
      </div>
    );
  }

  const submitting = status === "submitting";

  // One form for every variant: pill input + ink pill button, same height.
  const form = (
    <form ref={formRef} onSubmit={onSubmit} className="sbt-nl-form">
      {honeypot}
      <input
        type="email"
        aria-label="Email address"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={submitting}
        className="sbt-nl-input"
      />
      <button
        type="submit"
        disabled={submitting}
        className="sb-btn sb-btn--primary sbt-nl-submit"
      >
        {submitting ? "…" : "Subscribe"}
      </button>
    </form>
  );
  const errorLine = error ? <p className="sbt-nl-error" role="alert">{error}</p> : null;

  // ── Minimal: footer treatment. Compact but with a real headline so it
  //    reads as an offer, not a stray field.
  if (isMinimal) {
    return (
      <div className="sbt-nl-min">
        <div>
          <div className="sbt-nl-min-headline">Start your day with us! ☀️</div>
          <div className="sbt-nl-min-tagline">One email with everything we know about.</div>
        </div>
        {form}
        {errorLine}
      </div>
    );
  }

  if (isCard) {
    return (
      <div className="sbt-nl-card">
        <div className="sbt-nl-eyebrow">Daily at 6:00&nbsp;AM</div>
        <div className="sbt-nl-headline">A fresh plan every morning.</div>
        <p className="sbt-nl-tagline">
          One email: the day's plan, what's new, what's opening, what city hall did. Once a day. That's the whole deal.
        </p>
        {form}
        {errorLine}
      </div>
    );
  }

  // Inline: full-width strip with serif headline on the left, compact form
  // on the right. The form is fixed-width so the email field doesn't balloon
  // when the card spans the bucket grid; the spare width carries display type.
  return (
    <div className="sbt-nl-inline">
      <div className="sbt-nl-inline-text">
        <div className="sbt-nl-eyebrow">Daily at 6:00&nbsp;AM</div>
        <div className="sbt-nl-headline">A fresh plan every morning.</div>
        <p className="sbt-nl-tagline">
          Plus everything else we know about for the day.<br />
          One email. That's it.
        </p>
      </div>
      <div className="sbt-nl-inline-form">
        {form}
        {errorLine}
      </div>
    </div>
  );
}
