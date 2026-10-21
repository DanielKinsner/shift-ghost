import { ImageResponse } from "next/og";

const size = { width: 1200, height: 630 };

const row = (severity: string, title: string, detail: string, color: string) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 18, padding: "14px 0", borderBottom: "1px dashed rgba(26,26,23,.2)" }}>
    <span style={{ width: 92, color, fontSize: 19, fontWeight: 800, letterSpacing: 1.2 }}>{severity}</span>
    <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ color: "#1a1a17", fontSize: 24, fontWeight: 800 }}>{title}</span>
      <span style={{ color: "#5c574d", fontSize: 17 }}>{detail}</span>
    </span>
  </div>
);

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "54px 62px 48px",
        color: "#f3efe4",
        background: "radial-gradient(circle at 86% -10%, #351b0d 0%, #0b1017 38%, #07090d 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <svg width="36" height="38" viewBox="0 0 36 38">
            <path d="M4 34V17C4 8.7 10.3 2 18 2s14 6.7 14 15v17l-4-4-5 4-5-4-5 4-5-4-4 4Z" fill="#ff6b1a" />
            <circle cx="13" cy="17" r="2.2" fill="#0b1017" />
            <circle cx="23" cy="17" r="2.2" fill="#0b1017" />
          </svg>
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: 1.5 }}>SHIFT GHOST</span>
        </div>
        <span style={{ padding: "8px 13px", border: "2px solid #39d98a", borderRadius: 4, color: "#39d98a", fontSize: 17, fontWeight: 800, letterSpacing: 1.5, transform: "rotate(-1deg)" }}>
          INTERACTIVE PRODUCT DEMO
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 58 }}>
        <div style={{ width: 515, display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ width: 252, padding: "7px 11px", border: "2px solid #ff6b1a", borderRadius: 4, color: "#ff6b1a", fontSize: 17, fontWeight: 800, letterSpacing: 1.2, transform: "rotate(-2deg)" }}>
            CLOSE · DOWNTOWN · 22:40
          </div>
          <div style={{ fontSize: 66, lineHeight: 0.98, fontWeight: 800, letterSpacing: -2.2 }}>
            Two minutes of talk at close.
          </div>
          <div style={{ color: "#b7bfc8", fontSize: 27, lineHeight: 1.35 }}>A brief the morning crew can act on.</div>
        </div>

        <div style={{ width: 500, display: "flex", flexDirection: "column" }}>
          <div style={{ height: 13, background: "repeating-linear-gradient(-45deg,#ff6b1a 0 14px,#d9dde2 14px 28px)", borderRadius: 3 }} />
          <div style={{ display: "flex", flexDirection: "column", padding: "24px 28px 29px", color: "#1a1a17", background: "#e9e4d6", borderRadius: "5px 5px 0 0", boxShadow: "0 22px 42px rgba(0,0,0,.38)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#5c574d", fontSize: 15, letterSpacing: 1 }}>
              <span>OPENING BRIEF · DOWNTOWN</span>
              <span>06:00</span>
            </div>
            <div style={{ height: 1, margin: "15px 0 4px", background: "rgba(26,26,23,.22)" }} />
            {row("CRITICAL", "Ice machine grinding again", "6th mention in 9 days", "#b3261e")}
            {row("HIGH", "Large cups out", "Order before lunch rush", "#9a4300")}
            {row("HIGH", "Table 12 refund", "Luis · before lunch", "#9a4300")}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#8c97a4", fontSize: 18 }}>
        <span>VOICE → EVIDENCE → ACTION → PATTERNS</span>
        <span style={{ color: "#f3efe4" }}>A product case study by Daniel Kinsner</span>
      </div>
    </div>,
    { ...size, headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
