"use client";

/**
 * Last-resort boundary: only reached when the root layout itself throws, so it
 * has to render its own <html>/<body> and cannot rely on the app's CSS.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#FAFCFF",
          color: "#171717",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "480px", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", margin: "0 0 12px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#525252", lineHeight: 1.6, margin: "0 0 20px" }}>
            The site could not start this page. Please try again.
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", color: "#737373", fontFamily: "monospace" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "12px",
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              background: "#15678E",
              color: "#fff",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
