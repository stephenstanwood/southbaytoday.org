import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export default function NewsletterSignup({
  variant = "card",
}: {
  variant?: "card" | "inline" | "minimal";
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
        setError(data.error || "Something went wrong");
      }
    } catch {
      setStatus("error");
      setError("Network error — try again");
    }
  }

  const isCard = variant === "card";
  const isMinimal = variant === "minimal";

  if (status === "success") {
    if (isMinimal) {
      return (
        <div style={{ fontSize: 12, color: "#1a1a2e", fontFamily: "'Inter', sans-serif", textAlign: "center" }}>
          📬 You're in — first email at 6:00 AM tomorrow.
        </div>
      );
    }
    return (
      <div
        style={{
          padding: isCard ? "22px 24px" : "10px 0",
          background: isCard ? "#f3f1f8" : "transparent",
          borderRadius: isCard ? 4 : 0,
          textAlign: "center",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ fontWeight: 700, color: "#1a1a2e", marginBottom: 4, fontSize: 16 }}>
          You're in. 📬
        </div>
        <div style={{ fontSize: 14, color: "#5b6478" }}>
          A plan for the day lands in your inbox at 6:00&nbsp;AM.
        </div>
      </div>
    );
  }

  // ── Minimal: footer treatment. Just an email field + a button + a tiny
  //    "one email a day" label. No marketing block, no eyebrow.
  if (isMinimal) {
    return (
      <form
        onSubmit={onSubmit}
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <span style={{ fontSize: 12, color: "#666", fontWeight: 600, marginRight: 4 }}>
          Start your morning with us ☀️
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          style={{
            padding: "5px 10px",
            border: "1px solid #c8c4bc",
            borderRadius: 3,
            fontSize: 12,
            background: "#fff",
            color: "#1a1a2e",
            fontFamily: "inherit",
            width: 200,
          }}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            padding: "5px 12px",
            background: "#1a1a2e",
            color: "#fff",
            border: "none",
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            cursor: status === "submitting" ? "wait" : "pointer",
            opacity: status === "submitting" ? 0.7 : 1,
            fontFamily: "inherit",
          }}
        >
          {status === "submitting" ? "…" : "Subscribe"}
        </button>
        {error && (
          <span style={{ fontSize: 11, color: "#c0392b", width: "100%", textAlign: "center" }}>{error}</span>
        )}
      </form>
    );
  }

  if (isCard) {
    return (
      <div
        style={{
          padding: "22px 24px",
          background: "#f3f1f8",
          borderRadius: 4,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "#5b54c9", fontWeight: 800 }}>
          Daily at 6:00&nbsp;AM
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", marginTop: 4, lineHeight: 1.2, fontFamily: "'Playfair Display', Georgia, serif" }}>
          A fresh plan every morning.
        </div>
        <div style={{ fontSize: 14, color: "#5b6478", marginTop: 8, marginBottom: 14, lineHeight: 1.5 }}>
          One email. A plan for the day, everything we've found happening, openings, civic news. Once a day — that's the whole deal.
        </div>
        {renderForm({ inputFontSize: 15, buttonPadding: "10px 22px", buttonFontSize: 14 })}
        {error && <div style={{ fontSize: 13, color: "#c0392b", marginTop: 8 }}>{error}</div>}
      </div>
    );
  }

  // Inline: full-width strip with serif headline on the left, compact form
  // on the right. The form is fixed-width so the email field doesn't balloon
  // when the card spans the bucket grid; the spare width carries display type.
  return (
    <>
      <div className="sbt-nl-inline">
        <div className="sbt-nl-inline-text">
          <div className="sbt-nl-inline-eyebrow">Daily at 6:00&nbsp;AM</div>
          <div className="sbt-nl-inline-headline">A fresh plan, every morning.</div>
          <div className="sbt-nl-inline-tagline">
            Plus everything else we found. One email. That's it.
          </div>
        </div>
        <div className="sbt-nl-inline-form">
          {renderForm({ inputFontSize: 14, buttonPadding: "9px 18px", buttonFontSize: 13 })}
          {error && <div style={{ fontSize: 12, color: "#c0392b", marginTop: 6 }}>{error}</div>}
        </div>
      </div>
      <style>{`
        .sbt-nl-inline {
          display: flex;
          align-items: center;
          gap: 24px;
          font-family: 'Inter', sans-serif;
        }
        .sbt-nl-inline-text { flex: 1 1 auto; min-width: 0; }
        .sbt-nl-inline-eyebrow {
          font-size: 10px;
          letter-spacing: 1.6px;
          text-transform: uppercase;
          color: #5b54c9;
          font-weight: 800;
        }
        .sbt-nl-inline-headline {
          font-size: 26px;
          line-height: 1.15;
          font-weight: 800;
          color: #1a1a2e;
          margin-top: 2px;
          font-family: 'Playfair Display', Georgia, serif;
          letter-spacing: -0.5px;
        }
        .sbt-nl-inline-tagline {
          font-size: 13px;
          color: #5b6478;
          margin-top: 6px;
          line-height: 1.45;
        }
        .sbt-nl-inline-form {
          flex: 0 0 auto;
          width: 320px;
        }
        @media (max-width: 720px) {
          .sbt-nl-inline { flex-direction: column; align-items: stretch; gap: 12px; }
          .sbt-nl-inline-headline { font-size: 22px; }
          .sbt-nl-inline-form { width: 100%; }
        }
      `}</style>
    </>
  );

  function renderForm({
    inputFontSize,
    buttonPadding,
    buttonFontSize,
  }: { inputFontSize: number; buttonPadding: string; buttonFontSize: number }) {
    return (
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          style={{
            flex: "1 1 180px",
            minWidth: 0,
            padding: "10px 14px",
            border: "1px solid #c8c4bc",
            borderRadius: 4,
            fontSize: inputFontSize,
            background: "#fff",
            color: "#1a1a2e",
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            padding: buttonPadding,
            background: "#1a1a2e",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontSize: buttonFontSize,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            cursor: status === "submitting" ? "wait" : "pointer",
            opacity: status === "submitting" ? 0.7 : 1,
            fontFamily: "inherit",
          }}
        >
          {status === "submitting" ? "…" : "Subscribe"}
        </button>
      </form>
    );
  }
}
