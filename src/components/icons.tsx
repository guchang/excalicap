import type { ReactNode } from "react";

interface IconProps {
  readonly name:
    | "settings"
    | "script"
    | "recording"
    | "library"
    | "pause"
    | "play"
    | "stop"
    | "plus"
    | "delete"
    | "download"
    | "trash"
    | "copy"
    | "close";
}

interface IconSource {
  readonly children: ReactNode;
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly viewBox?: string;
}

const icons: Record<IconProps["name"], IconSource> = {
  settings: {
    children: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  },
  script: {
    children: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </>
    ),
  },
  recording: {
    children: (
      <>
        <rect x="3" y="5" width="14" height="14" rx="2" />
        <path d="m17 10 4-2v8l-4-2z" />
        <path d="M7 9h6M7 13h4" />
      </>
    ),
  },
  library: {
    children: (
      <g strokeWidth="1.25">
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
        <path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" />
        <line x1="3" y1="6" x2="3" y2="19" />
        <line x1="12" y1="6" x2="12" y2="19" />
        <line x1="21" y1="6" x2="21" y2="19" />
      </g>
    ),
  },
  pause: {
    children: <path d="M6 5h4v14H6zm8 0h4v14h-4z" />,
    fill: "currentColor",
    stroke: "none",
  },
  play: {
    children: <path d="M8 5v14l11-7z" />,
    fill: "currentColor",
    stroke: "none",
  },
  stop: {
    children: <rect x="6" y="6" width="12" height="12" rx="1" />,
    fill: "currentColor",
    stroke: "none",
  },
  plus: {
    children: (
      <>
        <line x1="7" y1="1" x2="7" y2="13" />
        <line x1="1" y1="7" x2="13" y2="7" />
      </>
    ),
    strokeWidth: 1.5,
    viewBox: "0 0 14 14",
  },
  delete: {
    children: (
      <>
        <line x1="1" y1="1" x2="7" y2="7" />
        <line x1="7" y1="1" x2="1" y2="7" />
      </>
    ),
    strokeWidth: 1.5,
    viewBox: "0 0 8 8",
  },
  download: {
    children: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
  },
  trash: {
    children: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="m19 6-1 15H6L5 6" />
        <path d="M10 11v5M14 11v5" />
      </>
    ),
  },
  copy: {
    children: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
  },
  close: {
    children: (
      <>
        <line x1="5" y1="5" x2="19" y2="19" />
        <line x1="19" y1="5" x2="5" y2="19" />
      </>
    ),
  },
};

export function Icon({ name }: IconProps) {
  const icon = icons[name];
  return (
    <svg
      aria-hidden="true"
      fill={icon.fill ?? "none"}
      stroke={icon.stroke ?? "currentColor"}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={icon.strokeWidth ?? 2}
      viewBox={icon.viewBox ?? "0 0 24 24"}
    >
      {icon.children}
    </svg>
  );
}
