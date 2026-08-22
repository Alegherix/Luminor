import "./browserAnnotations/guestPreload";

import { ipcRenderer } from "electron";

import { OFFSCREEN_NATIVE_INPUT_BLOCKED_CHANNEL } from "./browserOffscreen/nativeInputBlocking";
import { installOffscreenSelectShim } from "./browserOffscreen/selectShim";

const install = () =>
  installOffscreenSelectShim((report) => {
    ipcRenderer.send(OFFSCREEN_NATIVE_INPUT_BLOCKED_CHANNEL, report);
  });

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", install, { once: true });
} else {
  install();
}
