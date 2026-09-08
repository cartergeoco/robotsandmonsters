import type { SVGProps } from "react";

export type RamOrnamentName =
  | "corner-01"
  | "corner-02"
  | "divider-01"
  | "divider-02"
  | "frame-square"
  | "frame-circle"
  | "frame-header"
  | "marker-dot"
  | "marker-diamond"
  | "marker-compass";

interface RamOrnamentProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: RamOrnamentName;
}

export function RamOrnament({ name, className = "", ...props }: RamOrnamentProps) {
  const content = (() => {
    switch (name) {
      case "corner-01":
        return <path d="M1 15V1h14M1 7l6-6M4 12V4h8" />;
      case "corner-02":
        return (
          <>
            <path d="M1 15V1h14M1 9 9 1M5 15V5h10" />
            <circle cx="5" cy="5" r="1" />
          </>
        );
      case "divider-01":
        return (
          <>
            <path d="M1 8h43M52 8h43" />
            <path d="m48 3 5 5-5 5-5-5Z" />
            <circle cx="48" cy="8" r="1.5" />
          </>
        );
      case "divider-02":
        return (
          <>
            <path d="M1 8h36M59 8h36" />
            <circle cx="48" cy="8" r="7" />
            <path d="M48 1v14M41 8h14" />
            <circle cx="48" cy="8" r="2" />
          </>
        );
      case "frame-square":
        return (
          <>
            <rect x="2" y="2" width="20" height="20" />
            <path d="M2 7h3V2M22 7h-3V2M2 17h3v5M22 17h-3v5" />
          </>
        );
      case "frame-circle":
        return (
          <>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="6" />
            <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
          </>
        );
      case "frame-header":
        return (
          <>
            <path d="M1 12h26l5-5 5 5h26" />
            <path d="M1 16h29l2-2 2 2h29" />
            <circle cx="32" cy="7" r="2" />
          </>
        );
      case "marker-dot":
        return (
          <>
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </>
        );
      case "marker-diamond":
        return (
          <>
            <path d="m12 3 9 9-9 9-9-9Z" />
            <path d="m12 7 5 5-5 5-5-5Z" />
          </>
        );
      case "marker-compass":
        return (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="m12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          </>
        );
    }
  })();

  const wide = name.startsWith("divider");
  const header = name === "frame-header";
  return (
    <svg
      aria-hidden="true"
      className={`ram-ornament ${className}`}
      viewBox={wide ? "0 0 96 16" : header ? "0 0 64 18" : "0 0 24 24"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="square"
      strokeLinejoin="miter"
      {...props}
    >
      {content}
    </svg>
  );
}
