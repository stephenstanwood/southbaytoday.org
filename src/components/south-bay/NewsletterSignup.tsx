import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export default function NewsletterSignup({
  variant = "card",
}: {
  variant?: "card" | "inline";
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

  if (status === "success") {
    return (
      <div
        style={{
          padding: isCard ? "20px" : "12px 0",
          background: isCard ? "#f7f6fb" : "transparent",
          borderRadius: isCard ? 12 : 0,
          textAlign: "center",
        }}
      >
        <div style={{ fontWeight: 600, color: "#1a1a2e", marginBottom: 4 }}>
          You're in.
        </div>
        <div style={{ fontSize: 14, color: "#5b6478" }}>
          First email lands tomorrow morning.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: isCard ? "20px" : "0",
        background: isCard ? "#f7f6fb" : "transparent",
        borderRadius: isCard ? 12 : 0,
      }}
    >
      {isCard && (
        <>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: "#7c3aed",
              fontWeight: 700,
            }}
          >
            Daily newsletter
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", marginTop: 4 }}>
            South Bay Today, in your inbox
          </div>
          <div style={{ fontSize: 14, color: "#5b6478", marginTop: 6, marginBottom: 14 }}>
            One email every morning: today's plan, tonight's pick, every event we know about, openings, civic meetings, and whatever else is happening.
          </div>
        </>
      )}
      <form
        onSubmit={onSubmit}
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
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
            padding: "10px 14px",
            border: "1px solid #d4d7e0",
            borderRadius: 6,
            fontSize: 15,
            background: "#fff",
            color: "#1a1a2e",
          }}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            padding: "10px 20px",
            background: "#3b4ef0",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 600,
            cursor: status === "submitting" ? "wait" : "pointer",
            opacity: status === "submitting" ? 0.7 : 1,
          }}
        >
          {status === "submitting" ? "…" : "Subscribe"}
        </button>
      </form>
      {error && (
        <div style={{ fontSize: 13, color: "#dc2626", marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
}
