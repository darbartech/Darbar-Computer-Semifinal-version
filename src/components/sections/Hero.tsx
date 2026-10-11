"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  useReducedMotion,
  useInView,
  type Variants,
  type HTMLMotionProps,
} from "framer-motion";
import { Container } from "@/components/common/Container";
import { cn } from "@/lib/utils";
import type { SiteSettingsView } from "@/lib/settings-view";

/** The resolved hero group from `getSiteSettings()` (image URLs already mapped). */
export type HeroContent = SiteSettingsView["hero"];

/**
 * Safety net for callers that render `<Hero />` without settings. The homepage
 * always passes the live values; this mirrors the seeded defaults so the banner
 * is never blank in tests or isolated previews.
 */
const DEFAULT_HERO: HeroContent = {
  eyebrow: "37 Career-Focused· **Courses** Certified Trainers.",
  title: "Learn the Digital\nSkills That **Actually**\nGet You Hired.",
  subtitle:
    "DarbarTech’s hands-on training turns beginners into job-ready professionals. Small batches, flexible morning-to-evening timings, and trainers with real industry experience.",
  primaryCtaLabel: "Browse Courses",
  primaryCtaHref: "/courses",
  secondaryCtaLabel: "",
  secondaryCtaHref: "",
  imageMediaId: null,
  imageAlt: "Trainer guiding students at a DarbarTech computer lab",
  popupMediaId: null,
  popupAlt: "DarbarTech students working together",
  imageUrl:
    "https://cdn.prod.website-files.com/640021754b75fb0c4b535941/64539e138771820ebcb7619d_hero-image.png",
  popupImageUrl:
    "https://cdn.prod.website-files.com/640021754b75fb0c4b535941/6451ec7f19901e54999d5d0c_hero-popup-image-2.png",
};

/** `**phrase**` markup → a highlighted `<span>`; everything else is plain text. */
function renderInline(text: string, highlightClassName: string): React.ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part.length > 0)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <span key={index} className={highlightClassName}>
          {part.slice(2, -2)}
        </span>
      ) : (
        <React.Fragment key={index}>{part}</React.Fragment>
      )
    );
}

/** `\n` → `<br>` and `**phrase**` → highlight, used by the heading and eyebrow. */
function renderRich(text: string, highlightClassName: string): React.ReactNode {
  return text.split("\n").map((line, index) => (
    <React.Fragment key={index}>
      {index > 0 ? <br /> : null}
      {renderInline(line, highlightClassName)}
    </React.Fragment>
  ));
}

const CODE_TOKENS: ReadonlyArray<{
  label: string;
  color: "navy" | "cyan" | "muted";
  weight: "normal" | "medium" | "bold";
  mono: boolean;
}> = [
  { label: "JavaScript", color: "muted", weight: "medium", mono: false },
  { label: "Python", color: "navy", weight: "medium", mono: false },
  { label: "C++", color: "cyan", weight: "medium", mono: false },
  { label: "TypeScript", color: "navy", weight: "medium", mono: false },
  { label: "HTML", color: "muted", weight: "medium", mono: false },
  { label: "CSS", color: "cyan", weight: "medium", mono: false },
  { label: "React", color: "cyan", weight: "medium", mono: false },
  { label: "Node.js", color: "navy", weight: "medium", mono: false },
  { label: "SQL", color: "muted", weight: "medium", mono: false },
  { label: "Java", color: "navy", weight: "medium", mono: false },
  { label: "Git", color: "muted", weight: "medium", mono: false },
  { label: "MongoDB", color: "cyan", weight: "medium", mono: false },
  { label: "{ }", color: "cyan", weight: "bold", mono: true },
  { label: "<div>", color: "navy", weight: "medium", mono: true },
  { label: "</>", color: "cyan", weight: "medium", mono: true },
  { label: "( )", color: "navy", weight: "bold", mono: true },
  { label: "[ ]", color: "muted", weight: "bold", mono: true },
  { label: ";", color: "navy", weight: "bold", mono: true },
  { label: "=>", color: "cyan", weight: "bold", mono: true },
  { label: "#include", color: "navy", weight: "medium", mono: true },
  { label: "const", color: "muted", weight: "medium", mono: true },
  { label: "def", color: "cyan", weight: "medium", mono: true },
  { label: "SELECT", color: "navy", weight: "medium", mono: true },
  { label: "npm i", color: "muted", weight: "medium", mono: true },
];

const TOKEN_COLORS: Record<"navy" | "cyan" | "muted", string> = {
  navy: "#222F5D",
  cyan: "#22C7E8",
  muted: "#4A5568",
};

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const COLUMN_COUNT = 8;
const TOKENS_PER_COLUMN = 2;

type CodeRainToken = {
  id: number;
  label: string;
  color: "navy" | "cyan" | "muted";
  weight: "normal" | "medium" | "bold";
  mono: boolean;
  col: number;
  topStart: number;
  offsetX: number;
  sizePx: number;
  rotate: number;
  duration: number;
  delay: number;
  opacity: number;
};

function buildRain(): CodeRainToken[] {
  const rng = seededRandom(7);
  const list: CodeRainToken[] = [];
  let id = 0;
  for (let col = 0; col < COLUMN_COUNT; col++) {
    for (let i = 0; i < TOKENS_PER_COLUMN; i++) {
      const token = CODE_TOKENS[Math.floor(rng() * CODE_TOKENS.length)];
      const sizePx = 9 + rng() * 4;
      const topStart = -10 - rng() * 120;
      const offsetX = (rng() - 0.5) * 28;
      const rotate = (rng() - 0.5) * 4;
      const duration = 26 + rng() * 14;
      const delay = -(rng() * duration);
      const opacity = 0.008 + rng() * 0.012;
      list.push({
        id: id++,
        label: token.label,
        color: token.color,
        weight: token.weight,
        mono: token.mono,
        col,
        topStart,
        offsetX,
        sizePx,
        rotate,
        duration,
        delay,
        opacity,
      });
    }
  }
  return list;
}

type FloatIcon = {
  id: number;
  svg: React.ReactElement;
  x: string;
  y: string;
  size: number;
  opacity: number;
  floatY: [number, number];
  rotate: [number, number];
  floatSec: number;
  delay: number;
};

const ICON_JS = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#F7DF1E" d="M1.408 1.408h125.184v125.185H1.408z" />
    <path
      fill="#000"
      d="M116.347 96.736c-.917-5.711-4.641-10.508-15.672-14.981-3.832-1.761-8.104-3.022-9.377-5.926-.452-2.264-.512-3.525-.226-4.838 1.052-4.279 6.479-5.596 10.935-5.049 2.938.338 5.792 1.456 7.56 3.407l5.33-8.148c-3.339-3.042-7.732-4.62-13.196-4.838l-1.648.09c-4.084.24-8.387 1.649-11.088 4.077-4.931 4.438-4.871 10.359-4.267 16.001.587 6.422 4.231 9.633 12.879 13.497 9.071 3.926 12.689 6.289 13.426 10.645.596 4.493-.033 9.236-7.194 10.602-3.453.737-6.602.477-9.094-.95-2.468-1.669-4.177-4.311-5.981-7.603l-8.73 5.083c2.329 4.533 7.171 8.844 14.583 10.647 4.303 1.088 8.861.881 12.695-.484 9.259-3.277 10.313-8.299 10.124-11.576l.018-.909-.056-.001zm-50.927-37.793H51.22v36.396c0 6.785-.337 11.956-.787 13.853-1.238 4.912-5.588 4.179-7.283 4.088-2.021-.22-4.704-.993-6.203-1.989l-1.271-7.719h-.126c-.981 1.904-2.71 3.489-5.189 4.484-2.641.987-5.848 1.49-9.722 1.466l.213-8.808c1.97.043 4.189-.099 5.858-1.249 1.81-1.291 2.849-2.999 3.034-6.286.299-3.521.249-7.135.249-14.24z"
    />
  </svg>
);
const ICON_PYTHON = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <linearGradient id="py-a" x1="70.252" y1="1237.476" x2="170.659" y2="1151.089" gradientTransform="matrix(.563 0 0 -.568 -29.215 707.817)" gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor="#387EB8" />
      <stop offset="1" stopColor="#366994" />
    </linearGradient>
    <linearGradient id="py-b" x1="209.474" y1="1098.811" x2="173.62" y2="1149.537" gradientTransform="matrix(.563 0 0 -.568 -29.215 707.817)" gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor="#FFE052" />
      <stop offset="1" stopColor="#FFC331" />
    </linearGradient>
    <path fill="url(#py-a)" d="M63.391 1.988c-4.222.02-8.252.379-11.8 1.007-10.45 1.846-12.346 5.71-12.346 12.837v9.411h24.693v3.137H29.977c-7.176 0-13.46 4.313-15.426 12.521-2.023 8.476-2.36 14.956 0 23.554 1.755 6.387 5.947 12.209 13.124 12.209h8.792v-11.06c0-8.252 7.051-15.355 15.426-15.355h24.665c6.866 0 12.346-5.654 12.346-12.549V15.87c0-6.693-5.646-11.827-12.346-12.837-4.249-.566-8.62-.546-12.167-.045zm-13.63 6.158c2.554 0 4.634 2.117 4.634 4.721 0 2.593-2.08 4.691-4.633 4.691-2.562 0-4.633-2.098-4.633-4.691 0-2.604 2.07-4.721 4.633-4.721z" transform="translate(0 10.26)" />
    <path fill="url(#py-b)" d="M91.682 28.38v10.996c0 8.775-7.385 15.355-15.426 15.355H51.591c-6.754 0-12.346 5.783-12.346 12.549v23.515c0 6.691 5.818 10.628 12.346 12.547 7.816 2.273 15.312 2.513 24.665 0 6.216-1.651 12.346-5.421 12.346-12.547v-9.412H63.938v-3.138h37.012c7.176 0 9.852-5.005 12.348-12.521 2.575-7.94 2.383-14.957 0-23.554-1.77-6.419-5.152-12.209-12.348-12.209h-9.268zM77.809 76.949c2.562 0 4.635 2.099 4.635 4.692 0 2.603-2.073 4.72-4.635 4.72-2.553 0-4.632-2.117-4.632-4.72 0-2.593 2.079-4.692 4.632-4.692z" transform="translate(0 10.26)" />
  </svg>
);
const ICON_REACT = (
  <svg viewBox="-11.5 -10.23174 23 20.46348" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="0" cy="0" r="2.05" fill="#61dafb" />
    <g stroke="#61dafb" strokeWidth="1" fill="none">
      <ellipse rx="11" ry="4.2" />
      <ellipse rx="11" ry="4.2" transform="rotate(60)" />
      <ellipse rx="11" ry="4.2" transform="rotate(120)" />
    </g>
  </svg>
);
const ICON_HTML5 = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#E44D26" d="M19.037 113.876L9.032 1.661h109.936l-10.016 112.198-45.019 12.48z" />
    <path fill="#F16529" d="M64 116.8l36.378-10.086 8.559-95.878H64z" />
    <path fill="#EBEBEB" d="M64 52.455H45.788L44.53 38.361H64V24.599H29.489l.33 3.692 3.382 37.927H64zm0 35.743l-.061.017-15.327-4.14-.979-10.975H33.816l1.928 21.609 28.193 7.826.063-.017z" />
    <path fill="#fff" d="M63.952 52.455v13.763h16.947l-1.597 17.849-15.35 4.143v14.319l28.215-7.82.207-2.325 3.234-36.233.335-3.692h-3.71zm0-27.856v13.762h33.244l.276-3.092.628-6.978.329-3.692z" />
  </svg>
);
const ICON_CSS3 = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#1572B6" d="M18.814 114.123L8.76 1.352h110.48l-10.064 112.754-45.243 12.543z" />
    <path fill="#33A9DC" d="M64.001 117.062l36.559-10.136 8.601-96.354h-45.16z" />
    <path fill="#fff" d="M64.001 51.429h18.302l1.264-14.163H64.001V23.435h34.682l-.332 3.711-3.4 38.114H64.001z" />
    <path fill="#EBEBEB" d="M64.083 87.349l-.061.018-15.403-4.159-.985-11.031H33.752l1.937 21.717 28.331 7.863.063-.018z" />
    <path fill="#fff" d="M81.127 64.675l-1.666 18.522-15.426 4.164v14.39l28.354-7.858.208-2.337 2.406-26.881z" />
    <path fill="#EBEBEB" d="M64.048 23.435v13.831H30.64l-.277-3.108-.63-7.012-.331-3.711zm-.047 27.994v13.831H48.792l-.277-3.108-.631-7.012-.33-3.711z" />
  </svg>
);
const ICON_NODE = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#83CD29" d="M112.771 30.334L68.674 4.729c-2.781-1.584-6.402-1.584-9.205 0L14.901 30.334C12.031 31.985 10 35.088 10 38.407v51.142c0 3.319 2.084 6.423 4.954 8.083l11.775 6.688c5.628 2.772 7.617 2.772 10.178 2.772 8.333 0 13.093-5.039 13.093-13.828v-50.49c0-.713-.371-1.774-1.071-1.774h-5.623c-.712 0-2.306 1.061-2.306 1.773v50.49c0 3.896-3.524 7.773-10.11 4.48L18.723 90.73c-.424-.23-.723-.689-.723-1.181V38.407c0-.482.555-.966.982-1.213l44.424-25.561c.415-.235 1.025-.235 1.439 0l43.882 25.555c.42.253.272.722.272 1.219v51.142c0 .482.183.963-.232 1.198l-44.086 25.576c-.378.227-.847.227-1.261 0l-11.307-6.749c-.341-.198-.746-.269-1.073-.086-3.146 1.783-3.726 2.02-6.677 3.043-.726.253-1.797.692.41 1.929l14.798 8.754a9.294 9.294 0 004.647 1.246c1.642 0 3.25-.426 4.667-1.246l43.882-25.582c2.87-1.672 4.23-4.764 4.23-8.083V38.414c0-3.319-1.36-6.413-4.229-8.08z" />
    <path fill="#83CD29" d="M77.91 81.445c-11.726 0-14.309-3.235-15.17-9.066-.1-.628-.633-1.379-1.272-1.379h-5.731c-.709 0-1.279.86-1.279 1.566 0 7.466 4.059 16.512 23.453 16.512 14.039 0 22.088-5.455 22.088-15.109 0-9.572-6.467-12.084-20.082-13.886-13.762-1.819-15.16-2.738-15.16-5.962 0-2.658.142-7.485 18.884-7.485 10.823 0 13.341 2.227 14.452 7.571.1.499.639.875 1.134.875h5.754c.354 0 .692-.2.89-.526.283-.471.471-.67.691-1.201 1.96-7.58-3.054-17.713-22.921-17.713-12.645 0-21.651 5.334-21.651 14.315 0 9.72 7.544 12.373 19.78 13.588 14.552 1.456 15.531 3.473 15.531 6.355-.044 3.981-3.86 8.082-19.355 8.082z" />
  </svg>
);
const ICON_TS = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="128" height="128" rx="12" fill="#007acc" />
    <path fill="#fff" d="M22.67 47h82.67v10.667H68.672V115H55.994V57.667H22.668zm58.667 0c6.818 0 11.824 1.067 15.024 3.2 3.2 2.133 4.798 5.12 4.798 8.96 0 2.56-1.067 4.779-3.2 6.656-2.133 1.878-5.077 3.259-8.83 4.16l-12.011 2.844c-6.012 1.422-10.147 3.471-12.408 6.144-2.262 2.679-3.392 6.229-3.392 10.667 0 5.461 1.973 9.813 5.911 13.055 3.943 3.242 9.54 4.864 16.796 4.864 5.712 0 10.555-1.244 14.547-3.755 3.992-2.496 6.938-5.896 8.839-10.197l-10.133-6.037c-1.066 2.953-3.171 5.183-6.334 6.678-3.162 1.495-6.868 2.243-11.118 2.243-5.035 0-8.789-1.159-11.238-3.485-2.45-2.313-3.674-5.504-3.674-9.557 0-4.262 1.386-7.637 4.16-10.111 2.774-2.488 8.382-4.443 16.819-5.939l12.096-2.176c4.608-.875 8.107-2.42 10.509-4.65 2.4-2.21 3.602-5.303 3.602-9.25 0-5.23-1.993-9.387-6.007-12.495-4.003-3.095-9.716-4.659-17.123-4.659z" />
  </svg>
);
const ICON_GIT = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#F05032" d="M124.737 58.378L69.621 3.264c-3.172-3.174-8.32-3.174-11.497 0L46.68 14.71l14.518 14.518c3.375-1.139 7.243-.375 9.932 2.314 2.703 2.706 3.462 6.607 2.294 9.993l13.992 13.993c3.385-1.167 7.292-.413 9.994 2.295 3.78 3.777 3.78 9.9 0 13.679-3.78 3.78-9.901 3.78-13.683 0-2.844-2.844-3.545-7.019-2.105-10.521L68.574 47.933l-.002 34.341c.922.455 1.791 1.063 2.559 1.828 3.778 3.777 3.778 9.898 0 13.683-3.779 3.777-9.904 3.777-13.679 0-3.778-3.784-3.778-9.905-.002-13.683.935-.933 2.015-1.638 3.166-2.107V47.333c-1.15-.47-2.229-1.178-3.168-2.117-2.862-2.86-3.551-7.06-2.083-10.576L41.056 20.3 3.264 58.083c-3.174 3.177-3.174 8.325 0 11.5l55.117 55.114c3.174 3.174 8.32 3.174 11.499 0l54.858-54.858c3.174-3.176 3.174-8.325 0-11.499zM64.011 102.715c-2.629 0-4.76-2.13-4.76-4.758 0-2.627 2.131-4.76 4.76-4.76 2.626 0 4.758 2.132 4.758 4.76-.001 2.628-2.131 4.758-4.758 4.758zm.001-30.553c-2.629 0-4.76-2.131-4.76-4.76 0-2.626 2.131-4.758 4.76-4.758 2.626 0 4.758 2.132 4.758 4.758 0 2.629-2.131 4.76-4.758 4.76zm0-28.753c-2.629 0-4.76-2.131-4.76-4.76 0-2.626 2.131-4.758 4.76-4.758 2.626 0 4.758 2.132 4.758 4.758 0 2.629-2.131 4.76-4.758 4.76z" />
  </svg>
);
const ICON_CPP = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#00599C" d="M118.6 38.2-66 2.1c-5.6-2.9-11.4-4.1-17.1-3.7-5.7.3-11.1 2.3-15.6 6.1C-24 10.2-42.9 46-42.9 46c1.9-2.4 30.4 26.7 34.8 32C-4 85.1-1.6 93.6 2.6 101.9 6.7 112.7 16.9 123.5 28.9 126c15 3.2 29.4-2.5 38.9-14.9C82 99.8 117 74.1 117 74.1c-2 2.1-21.2 24.3-29.8 34.4-13.9 16.2-33.7 23.1-51.9 18.4-37.3-9.5-54.6-55.7-38.3-89.6C2.1-5.6 45.7-30.4 76-13.3 92.2-4.6 108.7 16.1 117 34.1c2.6 5.8 3.8 12.1 3.6 18.4 1.6-5.3-1.5-11.3-2-4.3z" transform="translate(44 .3)" />
    <path fill="#59A0D1" d="M73.1 85.3c0 23.8-19.3 43.1-43.1 43.1S-13.1 109.1-13.1 85.3 6.2 42.2 30 42.2s43.1 19.3 43.1 43.1z" transform="translate(44 .3)" opacity=".8" />
    <path fill="#004482" d="M54.3 78.5v8.4h-8.5v8.5h-8.4v-8.5h-8.5v-8.4h8.5v-8.5h8.4v8.5zm25.5 0v8.4h-8.5v8.5h-8.4v-8.5h-8.5v-8.4h8.5v-8.5h8.4v8.5z" transform="translate(44 .3)" />
    <path fill="#FFF" d="M54.3 74.5v8.4h-8.5v8.5h-8.4v-8.5h-8.5v-8.4h8.5v-8.5h8.4v8.5zm25.5 0v8.4h-8.5v8.5h-8.4v-8.5h-8.5v-8.4h8.5v-8.5h8.4v8.5z" transform="translate(44 .3)" />
  </svg>
);
const ICON_SQL = (
  <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#00758F" d="M64 8C37.49 8 16 17.163 16 28.571v70.858C16 110.837 37.49 120 64 120s48-9.163 48-20.571V28.571C112 17.163 90.51 8 64 8zm0 8c22.091 0 40 6.716 40 15 0 3.772-5.552 7.24-14.672 9.906-8.188 2.388-19.177 3.761-25.328 5.156-6.15-1.395-17.14-2.768-25.328-5.156C24.476 38.24 18 34.772 18 31c0-8.284 17.909-15 40-15zM18 41.887c5.265 2.324 13.206 4.412 21.62 6.082C31.383 51.308 26 57.305 26 64c0 6.695 5.383 12.692 13.62 16.031-8.414 1.67-16.355 3.758-21.62 6.082zm80 44.226c-5.266-2.324-13.207-4.412-21.621-6.082C84.617 76.692 90 70.695 90 64c0-6.695-5.383-12.692-13.621-16.031 8.414-1.67 16.355-3.758 21.621-6.082zM64 72c6.151 0 11.149-2.178 14.094-5.313v10.625C75.149 80.178 70.151 78 64 78s-11.149 2.178-14.094 5.313V66.688C52.851 69.822 57.849 72 64 72zm0-8c-6.151 0-11.149-2.178-14.094-5.313v10.625C52.851 72.178 57.849 70 64 70s11.149 2.178 14.094 5.313V58.688C75.149 61.822 70.151 64 64 64zm0-8c-6.151 0-11.149-2.178-14.094-5.313v10.625C52.851 64.178 57.849 62 64 62s11.149 2.178 14.094 5.313V50.688C75.149 53.822 70.151 56 64 56z" />
    <path fill="#F29111" d="M64 8c-26.51 0-48 9.163-48 20.571 0 3.772 6.476 7.24 16.328 9.906C32.86 40.847 43.85 42.22 50 43.615 56.15 45.01 60.607 47 64 50c3.393-3 7.85-4.99 14-6.385 6.15-1.395 17.14-2.768 25.328-5.156C107.524 35.832 112 32.364 112 28.571 112 17.163 90.51 8 64 8zM22 41.887V38.23l-.332-.185C22.85 39.644 22 40.579 22 41.887zm0 44.226c0 .01 0-.01 0 0zm42 8c-3.393 0-7.85-1.99-14-3.385-1.566-.355-3.186-.69-4.844-1.024v9.243l.385.217C51.74 97.72 57.535 94 64 94c6.465 0 12.26 3.72 18.459 7.164l.407-.227v-9.527c-1.726.36-3.43.717-5.12 1.101C73.952 92.197 69.308 94.114 64 94z" opacity=".35" />
  </svg>
);

const LANG_ICONS: ReadonlyArray<Omit<FloatIcon, "id">> = [
  { svg: ICON_JS, x: "left-[4%]", y: "top-[14%]", size: 36, opacity: 0.014, floatY: [-6, 8], rotate: [-4, 4], floatSec: 18, delay: 0.2 },
  { svg: ICON_PYTHON, x: "right-[7%]", y: "top-[10%]", size: 40, opacity: 0.013, floatY: [-6, 10], rotate: [3, -4], floatSec: 20, delay: 0.6 },
  { svg: ICON_REACT, x: "left-[14%]", y: "bottom-[16%]", size: 42, opacity: 0.012, floatY: [-8, 6], rotate: [-6, 6], floatSec: 19, delay: 1.0 },
  { svg: ICON_HTML5, x: "right-[18%]", y: "bottom-[10%]", size: 38, opacity: 0.012, floatY: [-5, 7], rotate: [4, -3], floatSec: 17, delay: 1.4 },
  { svg: ICON_CSS3, x: "left-[42%]", y: "top-[6%]", size: 36, opacity: 0.01, floatY: [-7, 7], rotate: [-3, 5], floatSec: 22, delay: 0.4 },
  { svg: ICON_NODE, x: "right-[38%]", y: "bottom-[4%]", size: 44, opacity: 0.01, floatY: [-9, 7], rotate: [6, -5], floatSec: 17, delay: 0.8 },
  { svg: ICON_TS, x: "left-[30%]", y: "bottom-[8%]", size: 34, opacity: 0.01, floatY: [-6, 10], rotate: [-7, 4], floatSec: 19, delay: 1.2 },
  { svg: ICON_GIT, x: "right-[30%]", y: "top-[18%]", size: 36, opacity: 0.01, floatY: [-8, 8], rotate: [8, -8], floatSec: 21, delay: 1.6 },
  { svg: ICON_CPP, x: "left-[22%]", y: "top-[38%]", size: 32, opacity: 0.01, floatY: [-5, 7], rotate: [-4, 6], floatSec: 14, delay: 0.9 },
  { svg: ICON_SQL, x: "right-[22%]", y: "top-[42%]", size: 34, opacity: 0.01, floatY: [-7, 6], rotate: [5, -6], floatSec: 18, delay: 1.8 },
];

const STAGGER = {
  eyebrow: 0.08,
  heading: 0.18,
  body: 0.32,
  cta: 0.46,
  visual: 0.58,
  popup1: 0.78,
  popup2: 0.84,
  popup3: 0.9,
} as const;

const fadeUp: Variants = {
  offscreen: { opacity: 0, y: 22, filter: "blur(6px)" },
  onscreen: (d: number = 0) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      delay: d,
      duration: 0.72,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

const fadeIn: Variants = {
  offscreen: { opacity: 0, scale: 0.94 },
  onscreen: (d: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: d, duration: 0.55, ease: "easeOut" },
  }),
};

type FloatProps = HTMLMotionProps<"div"> & {
  delay?: number;
  floatY?: [number, number];
  floatSec?: number;
};

function FloatWrap({
  delay = 0,
  floatY = [-6, 8],
  floatSec = 6,
  children,
  className,
  ...rest
}: FloatProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={fadeIn}
      initial="offscreen"
      whileInView="onscreen"
      viewport={{ once: true, amount: 0.3 }}
      custom={delay}
      animate={!reduce ? { y: [floatY[0], floatY[1], floatY[0]] } : undefined}
      transition={
        !reduce
          ? {
              y: {
                duration: floatSec,
                ease: "easeInOut",
                repeat: Infinity,
                delay: delay + 0.5,
              },
            }
          : undefined
      }
      className={cn(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function Hero({ hero = DEFAULT_HERO }: { hero?: HeroContent }) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const state = reduce || inView ? "onscreen" : "offscreen";

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  const effectiveReduce = mounted ? reduce : false;

  const rain = React.useMemo(() => buildRain(), []);
  const trackCols = React.useMemo(
    () =>
      Array.from({ length: COLUMN_COUNT }, (_, i) => {
        const rng = seededRandom(i * 13 + 3);
        return {
          left: Number(((i + 0.5) * (100 / COLUMN_COUNT)).toFixed(6)),
          opacity: Number((0.008 + rng() * 0.012).toFixed(6)),
        };
      }),
    [],
  );

  return (
    <section
      ref={ref}
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-[#FAFCFF]"
    >
      <style>{`
        @keyframes heroCodeRainFall {
          0%   { transform: translate3d(0, -12%, 0) rotate(var(--rot, 0deg)); opacity: 0; }
          12%  { opacity: var(--op, 0.04); }
          100% { transform: translate3d(0, 112%, 0) rotate(var(--rot, 0deg)); opacity: var(--op, 0.04); }
        }
        @keyframes heroIconFloat {
          0%   { transform: translate3d(0, var(--y0, 0px), 0) rotate(var(--r0, 0deg)); }
          50%  { transform: translate3d(0, var(--y1, 0px), 0) rotate(var(--r1, 0deg)); }
          100% { transform: translate3d(0, var(--y0, 0px), 0) rotate(var(--r0, 0deg)); }
        }
        @keyframes heroIconBlink {
          0%, 65%, 100% { opacity: var(--b0, 0.03); }
          82%           { opacity: var(--b1, 0.055); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-rain-token, .hero-rain-track, .hero-lang-icon { animation: none !important; }
        }
      `}</style>
      {/* ===== Code rain background pattern ===== */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* Soft falling track lines (diagonal fall trails) — EXTREMELY light */}
        <div className="absolute inset-0">
          {trackCols.map((t, i) => (
            <div
              key={`trk-${i}`}
              className="hero-rain-track absolute top-0 h-[140%] w-px origin-top"
              suppressHydrationWarning
              style={{
                left: `${t.left}%`,
                background:
                  "linear-gradient(to bottom, rgba(34,47,93,0) 0%, rgba(34,47,93,1) 30%, rgba(34,199,232,1) 70%, rgba(34,199,232,0) 100%)",
                opacity: t.opacity,
                transform: "rotate(11deg)",
                transformOrigin: "top center",
              }}
            />
          ))}
        </div>

        {/* Falling programming-language tokens — very light */}
        <div className="absolute inset-0">
          {rain.map((t) => {
            const leftPct = Number(
              ((t.col + 0.5) * (100 / COLUMN_COUNT)).toFixed(6)
            );
            const offsetXPx = Number((t.offsetX / 12).toFixed(6));
            const topStartRounded = Number(t.topStart.toFixed(6));
            const rotateRounded = Number(t.rotate.toFixed(6));
            const sizePxRounded = Number(t.sizePx.toFixed(6));
            const durationRounded = Number(t.duration.toFixed(6));
            const delayRounded = Number(t.delay.toFixed(6));
            const opacityRounded = Number(t.opacity.toFixed(6));

            const leftVal =
              offsetXPx >= 0
                ? `calc(${leftPct}% + ${offsetXPx}px)`
                : `calc(${leftPct}% - ${Math.abs(offsetXPx)}px)`;

            const fontVar =
              t.weight === "bold"
                ? 700
                : t.weight === "medium"
                  ? 500
                  : 400;
            return (
              <div
                key={t.id}
                className="hero-rain-token absolute top-0 whitespace-nowrap select-none"
                suppressHydrationWarning
                style={
                  {
                    left: leftVal,
                    transform: `translate3d(0, ${topStartRounded}%, 0) rotate(${rotateRounded}deg)`,
                    color: TOKEN_COLORS[t.color],
                    opacity: 0,
                    fontSize: `${sizePxRounded}px`,
                    fontWeight: fontVar,
                    fontFamily: t.mono
                      ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                      : "inherit",
                    letterSpacing: t.mono ? "0.01em" : "0",
                    ["--op" as string]: `${opacityRounded}`,
                    ["--rot" as string]: `${rotateRounded}deg`,
                    animation: !effectiveReduce
                      ? `heroCodeRainFall ${durationRounded}s linear ${delayRounded}s infinite`
                      : "none",
                  } as React.CSSProperties
                }
              >
                {t.label}
              </div>
            );
          })}
        </div>

        {/* Floating programming-language icon images around perimeter */}
        <div className="absolute inset-0">
          {LANG_ICONS.slice(0, 4).map((icon, i) => {
            const BLINK_CYCLE = 10;
            const blinkStep = BLINK_CYCLE / 4;
            const blinkDelay = i * blinkStep;
            const blinkBoost = Number((icon.opacity * 1.5).toFixed(6));
            const floatAni = !effectiveReduce
              ? `heroIconFloat ${icon.floatSec}s ease-in-out ${icon.delay}s infinite`
              : "none";
            const blinkAni = !effectiveReduce
              ? `heroIconBlink ${BLINK_CYCLE}s ease-in-out ${blinkDelay}s infinite`
              : "none";
            return (
              <div
                key={`li-${i}`}
                className={cn("hero-lang-icon absolute", icon.x, icon.y)}
                suppressHydrationWarning
                style={
                  {
                    width: `${icon.size}px`,
                    height: `${icon.size}px`,
                    opacity: icon.opacity,
                    filter: "drop-shadow(0 2px 6px rgba(23,43,72,0.06))",
                    ["--y0" as string]: `${icon.floatY[0]}px`,
                    ["--y1" as string]: `${icon.floatY[1]}px`,
                    ["--r0" as string]: `${icon.rotate[0]}deg`,
                    ["--r1" as string]: `${icon.rotate[1]}deg`,
                    ["--b0" as string]: `${icon.opacity}`,
                    ["--b1" as string]: `${blinkBoost}`,
                    animation:
                      floatAni === "none" && blinkAni === "none"
                        ? "none"
                        : [floatAni, blinkAni].filter((a) => a !== "none").join(", "),
                  } as React.CSSProperties
                }
              >
                {icon.svg}
              </div>
            );
          })}
        </div>
      </div>

      <Container size="xl" className="relative w-full">
        <div className="mx-auto grid min-h-[540px] sm:min-h-[620px] md:min-h-[640px] lg:min-h-[540px] grid-cols-1 items-center gap-8 sm:gap-10 md:gap-12 lg:grid-cols-12 lg:gap-12 xl:gap-16 py-[60px] sm:py-[70px] md:py-[72px] lg:py-[70px] pb-16 sm:pb-20 md:pb-[88px]">
          {/* ===== LEFT — Content block: eyebrow + h1 + body + CTAs ===== */}
          <motion.div
            variants={fadeUp}
            initial="offscreen"
            animate={state}
            custom={0}
            className="relative order-1 w-full max-w-full text-left lg:order-1 lg:col-span-6 xl:col-span-6 lg:pr-2 xl:pr-4 md:justify-self-center md:max-w-[720px]"
          >
            <motion.p
              variants={fadeUp}
              initial="offscreen"
              animate={state}
              custom={STAGGER.eyebrow}
              className="mb-6 inline-flex items-center text-[14px] leading-[22px] sm:text-[17px] sm:leading-[26px] md:text-[18px] md:leading-[28px] lg:text-[19px] font-small text-[#222F5D]"
            >
            
                <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22C7E8] opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" />
                </span>
                <span className="ml-2">
                  {renderRich(
                    hero.eyebrow,
                    "relative font-semibold whitespace-nowrap text-[#15678E]"
                  )}
                </span>
      
            </motion.p>

            <motion.h1
              id="hero-heading"
              variants={fadeUp}
              initial="offscreen"
              animate={state}
              custom={STAGGER.heading}
              className="text-[38px] sm:text-[46px] md:text-[58px] font-bold leading-[1.10] text-[#172B48] text-balance"
            >
              {renderRich(
                hero.title,
                "bg-gradient-to-r from-[#22C7E8] to-[#15678E] bg-clip-text text-transparent"
              )}
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="offscreen"
              animate={state}
              custom={STAGGER.body}
              className="mt-6 mb-8 w-full max-w-[100%] lg:max-w-[580px] text-[17px] sm:text-[18px] font-normal leading-[29px] text-[#4A5568] text-pretty"
            >
              {hero.subtitle}
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="offscreen"
              animate={state}
              custom={STAGGER.cta}
              className="mt-0 flex flex-nowrap items-center justify-start gap-2 sm:gap-5 md:gap-5 w-full overflow-hidden"
            >
              <Link
                href={hero.primaryCtaHref}
                className="group/cta group/btn relative inline-flex h-[38px] sm:h-13 md:h-12 cursor-pointer items-center gap-1.5 sm:gap-2 md:gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-[#172B48] to-[#222F5D] px-3.5 sm:px-8 md:px-7 text-white shadow-[0_8px_24px_-10px_rgba(23,43,72,0.55)] ring-1 ring-[#222F5D]/80 transition-all duration-300 hover:-translate-y-[1px] hover:shadow-[0_12px_32px_-10px_rgba(23,43,72,0.7)] active:translate-y-[1px]"
              >
                <span className="relative z-10 text-[12px] sm:text-[15.5px] md:text-[15px] font-semibold tracking-[0.01em] leading-none">
                  {hero.primaryCtaLabel}
                </span>
                <svg
                  aria-hidden="true"
                  className="relative z-10 h-[15px] w-[15px] sm:h-[18px] sm:w-[18px] md:h-[18px] md:w-[18px] -mr-0.5 translate-x-0 transition-transform duration-300 group-hover/cta:translate-x-[2px] shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/18 to-transparent transition-transform duration-700 ease-out group-hover/cta:translate-x-full"
                />
              </Link>

              {hero.secondaryCtaLabel && hero.secondaryCtaHref ? (
                <Link
                  href={hero.secondaryCtaHref}
                  className="inline-flex h-[38px] sm:h-13 md:h-12 cursor-pointer items-center rounded-lg border border-[#222F5D]/25 bg-white/70 px-3.5 sm:px-7 md:px-6 text-[#222F5D] shadow-[0_8px_24px_-14px_rgba(23,43,72,0.4)] transition-all duration-300 hover:-translate-y-[1px] hover:border-[#222F5D]/45 hover:bg-white active:translate-y-[1px]"
                >
                  <span className="text-[12px] sm:text-[15.5px] md:text-[15px] font-semibold tracking-[0.01em] leading-none">
                    {hero.secondaryCtaLabel}
                  </span>
                </Link>
              ) : null}
            </motion.div>
          </motion.div>

          {/* ===== RIGHT — Hero visual block: image + popup overlay ===== */}
          <motion.div
            variants={fadeUp}
            initial="offscreen"
            animate={state}
            custom={STAGGER.visual}
            className="relative order-2 mx-auto w-full max-w-[480px] sm:max-w-[560px] md:max-w-[600px] lg:order-2 lg:col-span-6 xl:col-span-6 lg:max-w-none md:justify-self-center"
          >
            <div className="relative mx-auto aspect-[425/440] w-full max-w-[480px] sm:max-w-[560px] md:max-w-[600px] max-h-[450px] sm:max-h-[470px] md:max-h-[520px] lg:max-h-[500px] lg:max-w-none">
              <Image
                src={hero.imageUrl}
                alt={hero.imageAlt || "Hero image"}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain"
              />

              <FloatWrap
                delay={STAGGER.popup2}
                floatY={[-8, 10]}
                floatSec={7}
                className="absolute left-0 top-[37%] sm:top-[36%] lg:top-[37%] w-[38%] sm:w-[38%] h-[40%]"
              >
                <Image
                  src={hero.popupImageUrl}
                  alt={hero.popupAlt || "Students popup"}
                  fill
                  sizes="160px"
                  className="object-contain drop-shadow-[0_20px_50px_-12px_rgba(23,43,72,0.18)]"
                />
              </FloatWrap>
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

export default Hero;
