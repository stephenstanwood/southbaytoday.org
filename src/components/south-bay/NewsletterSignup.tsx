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
          📬 You're in — first email tomorrow morning.
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
          Tomorrow's plan lands in your inbox by 6&nbsp;AM.
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
          📬 One email a day
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

  return (
    <div
      style={{
        padding: isCard ? "22px 24px" : "0",
        background: isCard ? "#f3f1f8" : "transparent",
        borderRadius: isCard ? 4 : 0,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {isCard ? (
        <>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: "#5b54c9",
              fontWeight: 800,
            }}
          >
            Daily — by 6&nbsp;AM
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", marginTop: 4, lineHeight: 1.2, fontFamily: "'Playfair Display', Georgia, serif" }}>
            A fresh plan every morning.
          </div>
          <div style={{ fontSize: 14, color: "#5b6478", marginTop: 8, marginBottom: 14, lineHeight: 1.5 }}>
            One email. Tomorrow's day plan, everything we've found happening, openings, civic news. Once a day — that's the whole deal.
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "#5b6478", marginBottom: 8, lineHeight: 1.5 }}>
          <strong style={{ color: "#1a1a2e" }}>Like today's plan? ☀️</strong> Get a fresh one every morning, plus everything else we've found happening today. 📬
        </div>
      )}
      <form
        onSubmit={onSubmit}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 420 }}
      >
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          style={{
            flex: "1 1 220px",
            minWidth: 0,
            padding: "10px 14px",
            border: "1px solid #c8c4bc",
            borderRadius: 4,
            fontSize: 15,
            background: "#fff",
            color: "#1a1a2e",
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            padding: "10px 22px",
            background: "#1a1a2e",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            fontSize: 14,
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
      {error && (
        <div style={{ fontSize: 13, color: "#c0392b", marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
}
