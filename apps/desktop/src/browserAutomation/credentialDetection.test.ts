import { describe, expect, it } from "vitest";

import {
  ACTIVE_CREDENTIAL_INPUT_EXPRESSION,
  CREDENTIAL_INPUT_CLASSIFIER_SNIPPET,
  credentialInputMatchFrom,
  HAS_CREDENTIAL_INPUT_EXPRESSION,
  IS_CREDENTIAL_INPUT_FUNCTION,
  type BrowserCredentialInputClassification,
} from "./credentialDetection";

// Prototype-backed fake DOM: state lives in a WeakMap so accessors genuinely
// resolve through the prototype chain (what the hardened classifier captures)
// and throw for detached objects (exercising the fail-closed path).
interface HarnessState {
  readonly localName: string;
  readonly attributes: Map<string, string>;
  readonly children: HarnessElement[];
  parent: HarnessElement | null;
  readonly contentEditable: boolean;
}

const internal = new WeakMap<object, HarnessState>();

const stateOf = (node: object): HarnessState => {
  const state = internal.get(node);
  if (!state) throw new TypeError("Illegal invocation");
  return state;
};

class HarnessNode {
  get nodeType(): number {
    stateOf(this);
    return 1;
  }

  get parentElement(): HarnessElement | null {
    return stateOf(this).parent;
  }
}

class HarnessElement extends HarnessNode {
  getAttribute(name: string): string | null {
    return stateOf(this).attributes.get(name) ?? null;
  }

  get localName(): string {
    return stateOf(this).localName;
  }

  get children(): readonly HarnessElement[] {
    return stateOf(this).children;
  }
}

class HarnessHTMLElement extends HarnessElement {
  get isContentEditable(): boolean {
    return stateOf(this).contentEditable;
  }
}

const element = (
  localName: string,
  attributes: Readonly<Record<string, string>> = {},
  options: { readonly contentEditable?: boolean } = {},
): HarnessHTMLElement => {
  const node = new HarnessHTMLElement();
  internal.set(node, {
    localName,
    attributes: new Map(Object.entries(attributes)),
    children: [],
    parent: null,
    contentEditable: options.contentEditable ?? false,
  });
  return node;
};

const append = (
  parent: HarnessHTMLElement,
  ...children: HarnessHTMLElement[]
): HarnessHTMLElement => {
  for (const child of children) {
    stateOf(parent).children.push(child);
    stateOf(child).parent = parent;
  }
  return parent;
};

const descendants = (root: HarnessHTMLElement): HarnessHTMLElement[] => {
  const collected: HarnessHTMLElement[] = [root];
  for (const child of stateOf(root).children)
    collected.push(...descendants(child as HarnessHTMLElement));
  return collected;
};

const classifierFrom = new Function(
  "Element",
  "Node",
  "HTMLElement",
  '"use strict"; return ' + CREDENTIAL_INPUT_CLASSIFIER_SNIPPET,
) as (
  elementCtor: unknown,
  nodeCtor: unknown,
  htmlElementCtor: unknown,
) => (candidate: unknown) => BrowserCredentialInputClassification;

const classify = (candidate: unknown): BrowserCredentialInputClassification =>
  classifierFrom(HarnessElement, HarnessNode, HarnessHTMLElement)(candidate);

const evaluateExpression = (
  expression: string,
  fakeDocument: unknown,
): BrowserCredentialInputClassification =>
  (
    new Function(
      "Element",
      "Node",
      "HTMLElement",
      "Document",
      "document",
      '"use strict"; return ' + expression,
    ) as (
      elementCtor: unknown,
      nodeCtor: unknown,
      htmlElementCtor: unknown,
      documentCtor: unknown,
      documentInstance: unknown,
    ) => BrowserCredentialInputClassification
  )(HarnessElement, HarnessNode, HarnessHTMLElement, undefined, fakeDocument);

describe("credential input classifier", () => {
  it("blocks password inputs regardless of attribute casing", () => {
    const input = element("input", { type: "PaSsWoRd", name: "user-pass" });
    expect(classify(input)).toEqual({ reason: "password-type", field: "user-pass" });
  });

  it("blocks credential autocomplete tokens and standalone username autocomplete", () => {
    expect(classify(element("input", { autocomplete: "one-time-code" }))).toEqual({
      reason: "credential-autocomplete",
    });
    expect(classify(element("input", { autocomplete: "username", name: "user" }))).toEqual({
      reason: "credential-autocomplete",
      field: "user",
    });
  });

  it("blocks OTP and code fields by keyword without type=password", () => {
    expect(classify(element("input", { name: "otp" }))).toMatchObject({
      reason: "credential-keyword",
    });
    expect(classify(element("input", { name: "verification-code" }))).toMatchObject({
      reason: "credential-keyword",
    });
    expect(classify(element("textarea", { "aria-label": "2FA code" }))).toMatchObject({
      reason: "credential-keyword",
    });
  });

  it.each([
    ["Contraseña", "aria-label"],
    ["Mot de passe", "placeholder"],
    ["Senha", "aria-label"],
    ["Kennwort", "placeholder"],
    ["Пароль", "aria-label"],
    ["密码", "placeholder"],
    ["パスワード", "aria-label"],
    ["비밀번호", "placeholder"],
  ])("blocks localized password fields labelled %s without type=password", (label, attribute) => {
    expect(classify(element("input", { [attribute]: label }))).toMatchObject({
      reason: "credential-keyword",
    });
  });

  it("blocks credential-labelled contenteditable surfaces", () => {
    const editable = element("div", { "aria-label": "Password" }, { contentEditable: true });
    expect(classify(editable)).toMatchObject({ reason: "credential-keyword" });
  });

  it("allows a benign email field in a form without credential fields", () => {
    const email = element("input", { type: "email", name: "email", placeholder: "Email address" });
    const form = element("form", { action: "/subscribe", class: "newsletter" });
    append(form, email, element("input", { type: "submit" }));
    expect(classify(email)).toBe(false);
  });

  it("allows identifier-flavored fields outside authentication flows", () => {
    const search = element("form", { class: "site-search" });
    const accountSearch = element("input", { name: "account-search" });
    const security = element("input", { name: "security" });
    const verification = element("input", { name: "verification" });
    append(search, accountSearch, security, verification);
    expect(classify(accountSearch)).toBe(false);
    expect(classify(security)).toBe(false);
    expect(classify(verification)).toBe(false);
  });

  it("blocks an email field when the surrounding form contains a password field", () => {
    const email = element("input", { type: "email", name: "email" });
    const form = element("form", { action: "/next" });
    append(form, email, element("input", { type: "password", name: "pass" }));
    expect(classify(email)).toEqual({ reason: "identifier-in-auth-context", field: "email" });
  });

  it("blocks an email field inside a sign-in labelled container", () => {
    const email = element("input", { type: "email", name: "email" });
    const wrapper = element("div", { class: "login-form" });
    append(wrapper, email);
    expect(classify(email)).toEqual({ reason: "identifier-in-auth-context", field: "email" });
  });

  it("treats localized identifier fields as context-dependent", () => {
    const standalone = element("input", { "aria-label": "Benutzername" });
    append(element("form", { class: "profile" }), standalone);
    expect(classify(standalone)).toBe(false);

    const inAuthFlow = element("input", { "aria-label": "Benutzername" });
    const form = element("form");
    append(form, inAuthFlow, element("input", { type: "password" }));
    expect(classify(inAuthFlow)).toMatchObject({ reason: "identifier-in-auth-context" });
  });

  it("ignores non-editable elements and null candidates", () => {
    expect(classify(null)).toBe(false);
    expect(classify(element("div", { class: "password-hint" }))).toBe(false);
    expect(classify(element("button", { name: "login" }))).toBe(false);
  });

  it("ignores hostile own-property shadowing of attribute accessors", () => {
    const input = element("input", { type: "password", name: "pass" });
    Object.defineProperty(input, "getAttribute", { value: () => "text" });
    Object.defineProperty(input, "localName", { value: "div" });
    Object.defineProperty(input, "nodeType", { value: 3 });
    expect(classify(input)).toEqual({ reason: "password-type", field: "pass" });
  });

  it("fails closed when element accessors throw", () => {
    const detached = Object.create(HarnessHTMLElement.prototype) as unknown;
    expect(classify(detached)).toEqual({ reason: "detection-error" });
  });
});

describe("composed credential expressions", () => {
  it("keeps the classifier marker in every composed entry point", () => {
    for (const source of [
      IS_CREDENTIAL_INPUT_FUNCTION,
      ACTIVE_CREDENTIAL_INPUT_EXPRESSION,
      HAS_CREDENTIAL_INPUT_EXPRESSION,
    ]) {
      expect(source).toContain("classifyCredentialInput");
    }
  });

  it("classifies the focused element through the active-input expression", () => {
    const password = element("input", { type: "password", name: "pass" });
    expect(
      evaluateExpression(ACTIVE_CREDENTIAL_INPUT_EXPRESSION, { activeElement: password }),
    ).toEqual({ reason: "password-type", field: "pass" });
    expect(evaluateExpression(ACTIVE_CREDENTIAL_INPUT_EXPRESSION, { activeElement: null })).toBe(
      false,
    );
  });

  it("surfaces the first credential field on the page through the has-input expression", () => {
    const form = element("form");
    append(
      form,
      element("input", { type: "search", name: "q" }),
      element("input", { type: "password", name: "pass" }),
    );
    const fields = descendants(form).filter((node) => stateOf(node).localName !== "form");
    expect(
      evaluateExpression(HAS_CREDENTIAL_INPUT_EXPRESSION, { querySelectorAll: () => fields }),
    ).toEqual({ reason: "password-type", field: "pass" });

    const benign = [element("input", { type: "search", name: "q" })];
    expect(
      evaluateExpression(HAS_CREDENTIAL_INPUT_EXPRESSION, { querySelectorAll: () => benign }),
    ).toBe(false);
  });

  it("fails closed when the page scan itself throws", () => {
    expect(
      evaluateExpression(HAS_CREDENTIAL_INPUT_EXPRESSION, {
        querySelectorAll: () => {
          throw new Error("hostile page");
        },
      }),
    ).toEqual({ reason: "detection-error" });
  });
});

describe("credentialInputMatchFrom", () => {
  it("passes real matches through and normalizes everything else", () => {
    const match = { reason: "password-type", field: "pass" } as const;
    expect(credentialInputMatchFrom(match)).toBe(match);
    expect(credentialInputMatchFrom(undefined)).toEqual({ reason: "detection-error" });
    expect(credentialInputMatchFrom(false)).toEqual({ reason: "detection-error" });
  });
});
