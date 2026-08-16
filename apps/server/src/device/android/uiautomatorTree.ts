import type { DeviceUiNode } from "@luminor/contracts";

const TAG_PATTERN = /<node\b([^>]*?)(\/?)>|<\/node>/gu;
const ATTRIBUTE_PATTERN = /([\w-]+)="([^"]*)"/gu;
const BOUNDS_PATTERN = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/u;

function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll("&amp;", "&");
}

interface MutableUiNode {
  role: string;
  subrole: string | null;
  label: string | null;
  value: string | null;
  frame: { x: number; y: number; width: number; height: number };
  activationPoint: null;
  children: MutableUiNode[];
}

function nodeFromAttributes(raw: string, scale: number): MutableUiNode {
  const attributes = new Map<string, string>();
  for (const match of raw.matchAll(ATTRIBUTE_PATTERN)) {
    attributes.set(match[1] ?? "", unescapeXml(match[2] ?? ""));
  }
  const bounds = BOUNDS_PATTERN.exec(attributes.get("bounds") ?? "");
  const [left, top, right, bottom] = bounds
    ? [Number(bounds[1]), Number(bounds[2]), Number(bounds[3]), Number(bounds[4])]
    : [0, 0, 0, 0];
  const className = attributes.get("class") ?? "";
  const text = attributes.get("text") ?? "";
  const contentDesc = attributes.get("content-desc") ?? "";
  const checkable = attributes.get("checkable") === "true";
  const label = contentDesc !== "" ? contentDesc : text !== "" ? text : null;
  const value = checkable
    ? attributes.get("checked") === "true"
      ? "1"
      : "0"
    : contentDesc !== "" && text !== ""
      ? text
      : null;
  return {
    role: className.split(".").at(-1) || "View",
    subrole: null,
    label,
    value,
    frame: {
      x: Math.round(left / scale),
      y: Math.round(top / scale),
      width: Math.round((right - left) / scale),
      height: Math.round((bottom - top) / scale),
    },
    activationPoint: null,
    children: [],
  };
}

export function parseUiautomatorXml(xml: string, scale: number): DeviceUiNode {
  const stack: MutableUiNode[] = [];
  const roots: MutableUiNode[] = [];
  for (const match of xml.matchAll(TAG_PATTERN)) {
    if (match[0] === "</node>") {
      const closed = stack.pop();
      if (closed && stack.length === 0) roots.push(closed);
      continue;
    }
    const node = nodeFromAttributes(match[1] ?? "", scale);
    const parent = stack.at(-1);
    if (parent) parent.children.push(node);
    else if (match[2] === "/") roots.push(node);
    if (match[2] !== "/") stack.push(node);
  }
  const root = roots[0];
  if (!root) throw new Error("uiautomator dump contained no nodes");
  return root;
}
