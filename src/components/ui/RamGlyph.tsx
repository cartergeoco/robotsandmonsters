import type { SVGProps } from "react";

export type RamGlyphName =
  | "player"
  | "enemy"
  | "npc"
  | "object"
  | "location"
  | "faction"
  | "quest"
  | "lore"
  | "inventory"
  | "spell"
  | "effect"
  | "danger"
  | "encounter"
  | "map";

interface RamGlyphProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: RamGlyphName;
  size?: number;
}

export function RamGlyph({ name, size = 20, className = "", ...props }: RamGlyphProps) {
  const mark = (() => {
    switch (name) {
      case "player":
        return (
          <>
            <circle cx="12" cy="8" r="2.25" />
            <path d="M7.5 17.5c.7-3.1 2.1-4.7 4.5-4.7s3.8 1.6 4.5 4.7" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
          </>
        );
      case "enemy":
        return (
          <>
            <path d="m7 7 5 2.7L17 7l-1.2 6.3L12 18l-3.8-4.7Z" />
            <circle cx="9.7" cy="12.2" r=".65" className="ram-glyph-fill" />
            <circle cx="14.3" cy="12.2" r=".65" className="ram-glyph-fill" />
            <path d="M4 4l3 1M20 4l-3 1" />
          </>
        );
      case "npc":
        return (
          <>
            <circle cx="12" cy="10" r="4.2" />
            <path d="M6.5 19c1.1-3 2.9-4.6 5.5-4.6s4.4 1.6 5.5 4.6" />
            <path d="M12 2v2M4.7 5.2l1.5 1.4M19.3 5.2l-1.5 1.4" />
          </>
        );
      case "object":
        return (
          <>
            <path d="m12 4 6.5 4v8L12 20l-6.5-4V8Z" />
            <path d="m5.5 8 6.5 4 6.5-4M12 12v8" />
            <circle cx="12" cy="4" r="1" className="ram-glyph-fill" />
          </>
        );
      case "location":
        return (
          <>
            <circle cx="12" cy="10" r="3" />
            <path d="M18 10c0 4.6-6 10-6 10S6 14.6 6 10a6 6 0 1 1 12 0Z" />
            <path d="M12 2V.7M4 10H2.5M20 10h1.5" />
          </>
        );
      case "faction":
        return (
          <>
            <path d="M12 3v18M12 5h7l-2 3 2 3h-7" />
            <circle cx="12" cy="3" r="1.4" />
            <path d="M7 21h10" />
          </>
        );
      case "quest":
        return (
          <>
            <path d="M6 4h12v16H6z" />
            <path d="M9 8h6M9 12h4M9 16h3" />
            <path d="m16 14 2 2 3-4" />
          </>
        );
      case "lore":
        return (
          <>
            <path d="M4 5.5c3-.8 5.7-.2 8 1.8v12c-2.3-2-5-2.6-8-1.8zM20 5.5c-3-.8-5.7-.2-8 1.8" />
            <path d="M20 5.5v12c-3-.8-5.7-.2-8 1.8" />
            <circle cx="12" cy="4" r="1" className="ram-glyph-fill" />
          </>
        );
      case "inventory":
        return (
          <>
            <path d="M5 8h14l-1 12H6Z" />
            <path d="M8 8V6a4 4 0 0 1 8 0v2M9 12h6" />
            <path d="M12 12v4" />
          </>
        );
      case "spell":
        return (
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M19.1 4.9l-3.5 3.5M8.4 15.6l-3.5 3.5" />
          </>
        );
      case "effect":
        return (
          <>
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
            <circle cx="12" cy="12" r=".8" className="ram-glyph-fill" />
          </>
        );
      case "danger":
        return (
          <>
            <path d="m12 3 9 17H3Z" />
            <path d="M12 8v6" />
            <circle cx="12" cy="17" r=".8" className="ram-glyph-fill" />
          </>
        );
      case "encounter":
        return (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="m8 6 8 12M16 6 8 18M12 1v3M12 20v3" />
            <circle cx="12" cy="12" r="2" />
          </>
        );
      case "map":
        return (
          <>
            <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" />
            <path d="M9 3v16M15 5v16" />
            <circle cx="15" cy="10" r="1.5" />
          </>
        );
    }
  })();

  return (
    <svg
      aria-hidden="true"
      className={`ram-glyph ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle className="ram-glyph-boundary" cx="12" cy="12" r="10.5" />
      {mark}
    </svg>
  );
}
