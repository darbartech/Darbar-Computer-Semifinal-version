import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0A1729 0%, #172B48 50%, #15678E 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px 96px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -80,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "rgba(21, 103, 142, 0.25)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -100,
            left: 200,
            width: 420,
            height: 420,
            borderRadius: "50%",
            background: "rgba(78, 140, 174, 0.18)",
            filter: "blur(50px)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: 48,
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 20,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg viewBox="0 0 100 100" width="60" height="60" xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="22" width="48" height="16" rx="3" fill="#15678E" />
              <polygon points="48,22 60,22 48,38" fill="#ffffff" />
              <rect x="18" y="38" width="16" height="40" rx="2" fill="#15678E" />
              <path
                d="M34,22 Q60,22 78,34 Q88,48 88,62 Q88,76 74,88 Q62,95 50,95 L50,95 Q50,95 50,80 Q50,70 50,62 Q68,62 72,52 Q72,40 60,34"
                fill="#ffffff"
                opacity="0.95"
              />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
              <span style={{ fontSize: 52, fontWeight: 800, color: "#ffffff", letterSpacing: -1.5 }}>Darbar</span>
              <span style={{ fontSize: 52, fontWeight: 800, color: "#4E8CAE", letterSpacing: -1.5 }}>Tech</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 6,
              }}
            >
              <div style={{ width: 28, height: 2, background: "#52525b" }} />
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  letterSpacing: 4,
                  color: "#a1a1aa",
                  textTransform: "uppercase",
                }}
              >
                Group of Technology
              </span>
              <div style={{ width: 28, height: 2, background: "#52525b" }} />
            </div>
          </div>
        </div>
        <h1
          style={{
            fontSize: 78,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.05,
            margin: 0,
            maxWidth: 900,
            letterSpacing: -2,
          }}
        >
          Hands-On Computer Training<br />That Actually Gets You Hired
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginTop: 56,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 24px",
              borderRadius: 999,
              background: "rgba(21, 103, 142, 0.35)",
              border: "1px solid rgba(78, 140, 174, 0.45)",
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700, color: "#ffffff" }}>37 Courses</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 24px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700, color: "#e4e4e7" }}>15 Career Fields</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 24px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 600, color: "#d4d4d8" }}>Kathmandu, Nepal</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
