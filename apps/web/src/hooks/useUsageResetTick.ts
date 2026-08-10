// FILE: useUsageResetTick.ts
// Purpose: Re-render usage reset countdowns exactly when their rendered unit flips, using one
// boundary-aligned timeout for every visible window instead of an interval per row.

import { getResetCountdownNextTickDelayForIso } from "@luminor/shared/usageResetCountdown";
import { useEffect, useState } from "react";

export function useUsageResetTick(resetTimes: ReadonlyArray<string | null | undefined>): void {
  const [tick, setTick] = useState(0);
  const resetKey = resetTimes.filter((value): value is string => Boolean(value)).join("|");

  useEffect(() => {
    if (resetKey.length === 0) {
      return;
    }
    const delay = getResetCountdownNextTickDelayForIso(Date.now(), resetKey.split("|"));
    const timeout = setTimeout(() => setTick((value) => value + 1), delay);
    return () => clearTimeout(timeout);
  }, [resetKey, tick]);
}
