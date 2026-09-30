import { useEffect, useRef, type ReactNode } from "react";

/** Heading used by every create-flow screen. It takes focus on mount so screen readers follow the flow. */
export function ScreenTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <header className="mb-4">
      <h1
        tabIndex={-1}
        ref={ref}
        className="mb-2 text-[1.85rem] font-medium leading-tight tracking-[-0.02em] outline-none"
      >
        {children}
      </h1>
      {sub && <p className="text-ink-soft">{sub}</p>}
    </header>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap justify-between gap-2.5">{children}</div>;
}

export const MIN_PHOTOS = 6;
export const MAX_PHOTOS = 24;
export const TARGET_PHOTOS = 12;
export const MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
