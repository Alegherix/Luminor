// FILE: DisclosureRegion.tsx
// Purpose: Controlled expand/collapse region with the shared sidebar-style grid animation.
// Layer: UI primitive
// Exports: DisclosureRegion, PresenceDisclosure
// Depends on: disclosureMotion helpers

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import {
  DISCLOSURE_CLEANUP_BUFFER_MS,
  DISCLOSURE_INNER_CLASS,
  DISCLOSURE_TRANSITION_MS,
  disclosureContentClassName,
  disclosureShellClassName,
} from "~/lib/disclosureMotion";

export function DisclosureRegion(props: {
  open: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const { open, children, className, contentClassName } = props;

  return (
    <div
      className={disclosureShellClassName(open, className)}
      aria-hidden={open ? undefined : true}
      inert={!open}
    >
      <div className={DISCLOSURE_INNER_CLASS}>
        <div className={disclosureContentClassName(open, contentClassName)}>{children}</div>
      </div>
    </div>
  );
}

export function PresenceDisclosure(props: {
  open: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const { open, children, className, contentClassName } = props;
  const [held, setHeld] = useState(open);
  const [visible, setVisible] = useState(open);
  const lastChildrenRef = useRef(children);

  useEffect(() => {
    if (open) {
      lastChildrenRef.current = children;
    }
  }, [children, open]);

  useLayoutEffect(() => {
    if (open) {
      setHeld(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      const fallback = window.setTimeout(() => setVisible(true), 0);
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(fallback);
      };
    }
    setVisible(false);
    if (!held) {
      return;
    }
    const cleanup = window.setTimeout(
      () => setHeld(false),
      DISCLOSURE_TRANSITION_MS + DISCLOSURE_CLEANUP_BUFFER_MS,
    );
    return () => window.clearTimeout(cleanup);
  }, [held, open]);

  if (!open && !held) {
    return null;
  }

  return (
    <DisclosureRegion
      open={visible}
      {...(className !== undefined ? { className } : {})}
      {...(contentClassName !== undefined ? { contentClassName } : {})}
    >
      {open ? children : lastChildrenRef.current}
    </DisclosureRegion>
  );
}
