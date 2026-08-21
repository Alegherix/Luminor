const PROXY_ATTRIBUTE = "data-luminor-select-proxy";
const SOURCE_ATTRIBUTE = "data-luminor-select-source";
const POPUP_ATTRIBUTE = "data-luminor-select-popup";
const NATIVE_INPUT_TYPES = new Set([
  "color",
  "date",
  "datetime-local",
  "file",
  "month",
  "time",
  "week",
]);

interface SelectPair {
  readonly select: HTMLSelectElement;
  readonly proxy: HTMLButtonElement;
}

const pairs = new WeakMap<HTMLSelectElement, SelectPair>();
let openPair: SelectPair | null = null;
let popup: HTMLDivElement | null = null;
let focusedOptionIndex = -1;

const closePopup = (restoreFocus = false): void => {
  popup?.remove();
  popup = null;
  if (restoreFocus) openPair?.proxy.focus();
  openPair = null;
  focusedOptionIndex = -1;
};

const syncProxy = ({ select, proxy }: SelectPair): void => {
  proxy.disabled = select.disabled;
  proxy.textContent = select.selectedOptions[0]?.textContent ?? "";
  proxy.setAttribute("aria-expanded", String(openPair?.select === select));
  proxy.setAttribute(
    "aria-label",
    select.getAttribute("aria-label") ?? select.name ?? select.id ?? "Select",
  );
};

const selectOption = (pair: SelectPair, index: number): void => {
  const option = pair.select.options.item(index);
  if (!option || option.disabled) return;
  pair.select.selectedIndex = index;
  pair.select.dispatchEvent(new Event("input", { bubbles: true }));
  pair.select.dispatchEvent(new Event("change", { bubbles: true }));
  syncProxy(pair);
  closePopup(true);
};

const focusOption = (index: number): void => {
  if (!popup || !openPair) return;
  const items = Array.from(popup.querySelectorAll<HTMLElement>("[role=option]"));
  const enabledIndexes = Array.from(openPair.select.options)
    .map((option, optionIndex) => (option.disabled ? -1 : optionIndex))
    .filter((optionIndex) => optionIndex >= 0);
  if (enabledIndexes.length === 0) return;
  focusedOptionIndex = enabledIndexes.includes(index) ? index : enabledIndexes[0]!;
  for (const item of items) {
    const isFocused = Number(item.dataset.optionIndex) === focusedOptionIndex;
    item.tabIndex = isFocused ? 0 : -1;
    if (isFocused) item.focus({ preventScroll: true });
  }
};

const openPopup = (pair: SelectPair): void => {
  closePopup();
  openPair = pair;
  const { select, proxy } = pair;
  const rect = proxy.getBoundingClientRect();
  const styles = getComputedStyle(select);
  popup = document.createElement("div");
  popup.setAttribute(POPUP_ATTRIBUTE, "");
  popup.setAttribute("role", "listbox");
  popup.setAttribute("aria-label", proxy.getAttribute("aria-label") ?? "Select");
  Object.assign(popup.style, {
    position: "fixed",
    zIndex: "2147483647",
    left: `${Math.max(0, Math.min(rect.left, innerWidth - rect.width))}px`,
    top: `${Math.min(rect.bottom + 2, innerHeight - 88)}px`,
    minWidth: `${Math.max(1, rect.width)}px`,
    maxWidth: `${Math.max(1, innerWidth - rect.left - 8)}px`,
    maxHeight: `${Math.max(80, innerHeight - rect.bottom - 8)}px`,
    overflow: "auto",
    padding: "4px",
    border: "1px solid rgb(139 149 181)",
    borderRadius: "7px",
    background: "rgb(37 43 67)",
    color: "rgb(246 247 251)",
    boxShadow: "0 8px 24px rgb(0 0 0 / 60%)",
    font: styles.font,
  });
  for (const [index, option] of Array.from(select.options).entries()) {
    const item = document.createElement("div");
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(option.selected));
    item.dataset.optionIndex = String(index);
    item.textContent = option.textContent;
    item.tabIndex = -1;
    Object.assign(item.style, {
      padding: "7px 10px",
      borderRadius: "4px",
      cursor: option.disabled ? "not-allowed" : "default",
      opacity: option.disabled ? "0.5" : "1",
      background: option.selected ? "rgb(70 80 113)" : "transparent",
    });
    item.addEventListener("mousedown", (event) => event.preventDefault());
    item.addEventListener("click", () => selectOption(pair, index));
    popup.append(item);
  }
  document.documentElement.append(popup);
  syncProxy(pair);
  focusOption(select.selectedIndex);
};

const upgradeSelect = (select: HTMLSelectElement): void => {
  if (pairs.has(select) || select.multiple || select.size > 1) return;
  const proxy = document.createElement("button");
  proxy.type = "button";
  proxy.setAttribute(PROXY_ATTRIBUTE, "");
  proxy.id = select.id;
  proxy.className = select.className;
  proxy.style.cssText = select.style.cssText;
  proxy.setAttribute("aria-haspopup", "listbox");
  proxy.setAttribute("aria-expanded", "false");
  select.removeAttribute("id");
  select.setAttribute(SOURCE_ATTRIBUTE, "");
  select.hidden = true;
  select.after(proxy);
  const pair = { select, proxy };
  pairs.set(select, pair);
  syncProxy(pair);
  select.addEventListener("input", () => syncProxy(pair));
  select.addEventListener("change", () => syncProxy(pair));
  proxy.addEventListener("click", (event) => {
    event.preventDefault();
    openPopup(pair);
  });
  proxy.addEventListener("keydown", (event) => {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      openPopup(pair);
    }
  });
};

const upgradeTree = (root: ParentNode): void => {
  if (root instanceof HTMLSelectElement) upgradeSelect(root);
  for (const select of Array.from(root.querySelectorAll<HTMLSelectElement>("select"))) {
    upgradeSelect(select);
  }
};

export const installOffscreenSelectShim = (): void => {
  upgradeTree(document);
  new MutationObserver((records) => {
    for (const record of records) {
      const changedSelect =
        record.target instanceof HTMLSelectElement
          ? record.target
          : record.target instanceof Element
            ? record.target.closest<HTMLSelectElement>("select")
            : null;
      if (changedSelect) {
        const pair = pairs.get(changedSelect);
        if (pair) {
          syncProxy(pair);
          if (openPair === pair) closePopup(true);
        }
      }
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Element) upgradeTree(node);
      }
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["disabled", "aria-label", "selected", "value"],
    childList: true,
    subtree: true,
  });
  document.addEventListener(
    "mousedown",
    (event) => {
      if (popup && event.target instanceof Node && !popup.contains(event.target)) closePopup();
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      const input =
        event.target instanceof Element ? event.target.closest<HTMLInputElement>("input") : null;
      if (!input || !NATIVE_INPUT_TYPES.has(input.type)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (!popup || !openPair) return;
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        closePopup(event.key === "Escape");
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectOption(openPair, focusedOptionIndex);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const enabled = Array.from(openPair.select.options)
        .map((option, index) => (option.disabled ? -1 : index))
        .filter((index) => index >= 0);
      const current = enabled.indexOf(focusedOptionIndex);
      const next =
        event.key === "Home"
          ? enabled[0]
          : event.key === "End"
            ? enabled.at(-1)
            : enabled[
                Math.max(
                  0,
                  Math.min(enabled.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)),
                )
              ];
      if (next !== undefined) focusOption(next);
    },
    true,
  );
  addEventListener("resize", () => closePopup());
  addEventListener("scroll", () => closePopup(), true);
};
