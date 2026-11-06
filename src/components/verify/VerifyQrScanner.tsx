"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Camera, CameraOff, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tokenFromReference } from "@/lib/certificate-reference";

type ScanStatus = "idle" | "requesting" | "scanning" | "processing" | "error" | "unsupported";

/**
 * Pulls the verification token out of whatever the QR encoded (verify URL or bare
 * token). Anything else — a certificate number, an unrelated link — is not a token and
 * is not sent to the token page.
 */
export function extractVerifyToken(decoded: string): string | null {
  return tokenFromReference(decoded);
}

export function VerifyQrScanner() {
  const router = useRouter();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rafRef = React.useRef<number>(0);
  const streamRef = React.useRef<MediaStream | null>(null);
  const busyRef = React.useRef(false);
  const [status, setStatus] = React.useState<ScanStatus>("idle");
  const [message, setMessage] = React.useState("");

  const stopCamera = React.useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    streamRef.current = null;
    setStatus("idle");
    setMessage("");
  }, []);

  React.useEffect(() => stopCamera, [stopCamera]);

  const scanLoopRef = React.useRef<() => void>(() => {});

  const scanFrame = React.useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(scanLoopRef.current);
      return;
    }
    if (!busyRef.current) {
      busyRef.current = true;
      setTimeout(() => {
        busyRef.current = false;
      }, 160);
      try {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(image.data, image.width, image.height, {
            inversionAttempts: "dontInvert",
          });
          if (result?.data) {
            const value = extractVerifyToken(result.data);
            if (value) {
              setStatus("processing");
              stopCamera();
              // The token page is the canonical destination for a scanned
              // certificate (docs 01 §S7): it verifies from the unguessable token
              // alone and needs neither the name nor the anti-spam check.
              router.push(`/verify/${encodeURIComponent(value)}`);
              return;
            }
          }
        }
      } catch {
        // Frame decode errors are transient — keep scanning.
      }
    }
    rafRef.current = requestAnimationFrame(scanLoopRef.current);
  }, [router, stopCamera]);

  React.useEffect(() => {
    scanLoopRef.current = scanFrame;
  }, [scanFrame]);

  const startScanning = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setMessage(
        "Camera scanning is not supported on this browser/device. Search or paste the verification code instead."
      );
      return;
    }
    setStatus("requesting");
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("scanning");
      rafRef.current = requestAnimationFrame(scanLoopRef.current);
    } catch {
      setStatus("error");
      setMessage(
        "Could not start the camera (permission denied or unavailable). You can still search or paste the verification code below."
      );
    }
  };

  const isActive = status === "scanning" || status === "processing";

  return (
    <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative flex min-h-[220px] flex-1 flex-col items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-950">
        <video
          ref={videoRef}
          playsInline
          muted
          className={isActive ? "h-full max-h-[220px] w-full object-cover" : "hidden"}
        />
        {isActive && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-40 rounded-2xl border-2 border-dashed border-primary/70" />
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

        {!isActive && (
          <div className="flex flex-col items-center gap-2 px-6 py-6 text-center text-neutral-300">
            {status === "requesting" ? (
              <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            ) : (
              <ScanLine className="size-8 text-primary" aria-hidden="true" />
            )}
            {status === "requesting" && <p className="text-sm text-neutral-400">Requesting camera…</p>}
            {status === "error" && <p className="max-w-xs text-sm text-neutral-400">{message}</p>}
            {status === "unsupported" && <p className="max-w-xs text-sm text-neutral-400">{message}</p>}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:max-w-[220px]">
        <Button
          type="button"
          variant={isActive ? "secondary" : "default"}
          onClick={() => (isActive ? stopCamera() : startScanning())}
          disabled={status === "requesting" || status === "processing"}
        >
          {isActive ? (
            <>
              <CameraOff className="size-4" aria-hidden="true" /> Stop camera
            </>
          ) : (
            <>
              <Camera className="size-4" aria-hidden="true" /> Scan QR code
            </>
          )}
        </Button>
        <p className="text-xs leading-relaxed text-neutral-500">
          Point the camera at the QR code on the certificate. The printed code
          links to a verification URL — scanning it verifies instantly.
        </p>
      </div>
    </div>
  );
}