export const APP_BASE_NAME = "Luminor";
const isCanaryDesktop =
  typeof window !== "undefined" && window.location?.protocol === "luminor-canary:";
export const APP_DISPLAY_NAME = isCanaryDesktop
  ? "Luminor Canary"
  : import.meta.env.DEV
    ? `${APP_BASE_NAME} (Dev)`
    : APP_BASE_NAME;
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
