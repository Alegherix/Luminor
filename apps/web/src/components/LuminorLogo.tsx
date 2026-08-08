// FILE: LuminorLogo.tsx
// Purpose: Render the shared Luminor icon asset through an inline SVG wrapper.
// Layer: Shared app branding primitive

import type { SVGProps } from "react";
import { cn } from "~/lib/utils";

export function LuminorLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  const ariaLabel = props["aria-label"];

  return (
    <svg
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={ariaLabel ? undefined : true}
      {...props}
      className={cn("shrink-0", className)}
    >
      <image href="/luminor-logo.svg" width="1024" height="1024" />
    </svg>
  );
}
