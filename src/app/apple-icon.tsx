import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/svg+xml";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#172B48",
          borderRadius: 40,
        }}
      >
        <svg viewBox="0 0 100 100" width="110" height="110" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(8, 8) scale(0.84)">
            <rect x="5" y="22" width="48" height="16" rx="3" fill="#15678E" />
            <polygon points="48,22 60,22 48,38" fill="#ffffff" />
            <rect x="18" y="38" width="16" height="40" rx="2" fill="#15678E" />
            <path
              d="M34,22 Q60,22 78,34 Q88,48 88,62 Q88,76 74,88 Q62,95 50,95 L50,95 Q50,95 50,80 Q50,70 50,62 Q68,62 72,52 Q72,40 60,34"
              fill="#ffffff"
              opacity="0.95"
            />
          </g>
        </svg>
      </div>
    ),
    { ...size }
  );
}
