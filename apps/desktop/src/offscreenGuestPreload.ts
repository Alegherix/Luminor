import "./browserAnnotations/guestPreload";

import { installOffscreenSelectShim } from "./browserOffscreen/selectShim";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installOffscreenSelectShim, { once: true });
} else {
  installOffscreenSelectShim();
}
