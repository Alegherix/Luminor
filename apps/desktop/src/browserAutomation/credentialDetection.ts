// Single source of truth for credential-input detection. Every injected
// boundary — typing, key presses, arbitrary evaluation, and snapshot
// redaction — embeds the same classifier so they cannot drift apart.

/**
 * Why an element was classified as a credential input. Kept host-side on
 * `BrowserAutomationHostError` for a future one-time human override; never
 * serialized into the provider-visible error envelope.
 */
export interface BrowserCredentialInputMatch {
  readonly reason:
    | "password-type"
    | "credential-autocomplete"
    | "credential-keyword"
    | "identifier-in-auth-context"
    | "detection-error";
  readonly field?: string;
}

/**
 * `false` when the element is safe for agent input, otherwise a bounded
 * description of which field matched and why. Injected checks return a match
 * object (never `true`) on internal failure, so hosts must treat every
 * non-`false` value as a credential input.
 */
export type BrowserCredentialInputClassification = false | BrowserCredentialInputMatch;

/** Normalizes an injected classification into fail-closed override context. */
export const credentialInputMatchFrom = (
  value: BrowserCredentialInputClassification | undefined,
): BrowserCredentialInputMatch =>
  value !== false &&
  value !== undefined &&
  typeof value === "object" &&
  typeof value.reason === "string"
    ? value
    : { reason: "detection-error" };

// Evaluates to `(element) => BrowserCredentialInputClassification`.
//
// The classifier can run in page-reachable contexts, so it reads attributes
// through prototype accessors captured at injection time instead of instance
// properties a hostile page can shadow, and treats every internal failure as a
// credential input. Environments without DOM constructors (unit harnesses)
// fall back to instance access.
//
// Password and one-time-code fields block unconditionally, including localized
// keywords for the major languages. Identifier-style fields (username/email)
// block only inside a plausible authentication flow: the field carries an
// authentication autocomplete token, an enclosing container advertises
// sign-in, or a nearby container also holds a password/one-time-code field.
export const CREDENTIAL_INPUT_CLASSIFIER_SNIPPET = String.raw`(() => {
  const elementCtor = typeof Element === "function" ? Element : null;
  const nodeCtor = typeof Node === "function" ? Node : null;
  const htmlElementCtor = typeof HTMLElement === "function" ? HTMLElement : null;
  const protoGetter = (ctor, property) => {
    const descriptor = ctor ? Object.getOwnPropertyDescriptor(ctor.prototype, property) : null;
    return descriptor && typeof descriptor.get === "function" ? descriptor.get : null;
  };
  const protoGetAttribute =
    elementCtor && typeof elementCtor.prototype.getAttribute === "function"
      ? elementCtor.prototype.getAttribute
      : null;
  const getNodeType = protoGetter(nodeCtor, "nodeType");
  const getParentElement = protoGetter(nodeCtor, "parentElement");
  const getLocalName = protoGetter(elementCtor, "localName");
  const getChildren = protoGetter(elementCtor, "children");
  const getIsContentEditable = protoGetter(htmlElementCtor, "isContentEditable");
  const read = (getter, element, property) => (getter ? getter.call(element) : element[property]);
  const rawAttribute = (element, name) =>
    String((protoGetAttribute ? protoGetAttribute.call(element, name) : element.getAttribute(name)) ?? "");
  const attribute = (element, name) => rawAttribute(element, name).toLowerCase();
  const CREDENTIAL_AUTOCOMPLETE = ["current-password", "new-password", "one-time-code"];
  const SECRET_PATTERN = /\b(password|passcode|passphrase|pass[-_\s]?word|otp|totp|2fa|mfa|pin|cvv|cvc|one[-_\s]?time|verification[-_\s]?code|security[-_\s]?code|auth[-_\s]?code|passwort|kennwort|wachtwoord|senha|palavra[-_\s]?passe|contraseña|contrasena|contrasenya|mot[-_\s]?de[-_\s]?passe|hasło|haslo|lösenord|losenord|passord|adgangskode|salasana|jelszo|heslo|geslo|sifre|parola|lozinka)\b|jelszó|şifre|парол|密码|密碼|验证码|驗證碼|パスワード|ワンタイム|認証コード|비밀번호|인증번호|인증코드|סיסמה|كلمة المرور|كلمة السر|पासवर्ड|รหัสผ่าน/;
  const IDENTIFIER_PATTERN = /\b(username|user[-_\s]?name|user[-_\s]?id|userid|email|e[-_\s]?mail|login|log[-_\s]?in|sign[-_\s]?in|account|identifier|verification|security|benutzername|nutzername|usuario|utilisateur|identifiant|utente|gebruikersnaam|correo|courriel|kullanici)\b|kullanıcı|użytkownik|логин|пользовател|почт|用户名|账号|帳號|ユーザー|メール|邮箱|아이디|이메일/;
  const AUTH_CONTEXT_PATTERN = /\b(login|log[-_\s]?in|logon|log[-_\s]?on|signin|sign[-_\s]?in|signup|sign[-_\s]?up|register|registration|auth|authenticate|authentication|credential|password|passwort|contraseña|senha|session)\b|парол|密码|密碼|パスワード|비밀번호/;
  const describedAttributes = (element) => [
    attribute(element, "type"),
    attribute(element, "autocomplete"),
    attribute(element, "name"),
    attribute(element, "id"),
    attribute(element, "aria-label"),
    attribute(element, "placeholder"),
  ].join(" ");
  const isSecretElement = (element) => {
    const tag = String(read(getLocalName, element, "localName") ?? "").toLowerCase();
    if (tag !== "input" && tag !== "textarea") return false;
    return attribute(element, "type") === "password" ||
      CREDENTIAL_AUTOCOMPLETE.includes(attribute(element, "autocomplete")) ||
      SECRET_PATTERN.test(describedAttributes(element));
  };
  const containsSecretField = (container) => {
    const stack = [container];
    let visited = 0;
    while (stack.length > 0) {
      const current = stack.pop();
      visited += 1;
      // A container too large to scan within budget blocks rather than allows.
      if (visited > 250) return true;
      if (read(getNodeType, current, "nodeType") === 1 && isSecretElement(current)) return true;
      const children = read(getChildren, current, "children");
      const length = children ? Number(children.length) : 0;
      for (let index = 0; index < length; index += 1) stack.push(children[index]);
    }
    return false;
  };
  const inAuthenticationContext = (element) => {
    let ancestor = read(getParentElement, element, "parentElement");
    let container = null;
    let fallback = null;
    for (let hops = 1; ancestor && read(getNodeType, ancestor, "nodeType") === 1 && hops <= 8; hops += 1) {
      const described = [
        attribute(ancestor, "id"),
        attribute(ancestor, "name"),
        attribute(ancestor, "class"),
        attribute(ancestor, "action"),
        attribute(ancestor, "aria-label"),
      ].join(" ");
      if (AUTH_CONTEXT_PATTERN.test(described)) return true;
      const tag = String(read(getLocalName, ancestor, "localName") ?? "").toLowerCase();
      const role = attribute(ancestor, "role");
      if (!container && (tag === "form" || tag === "fieldset" || tag === "dialog" || role === "form" || role === "dialog")) {
        container = ancestor;
      }
      if (hops === 3) fallback = ancestor;
      ancestor = read(getParentElement, ancestor, "parentElement");
    }
    // Without a form-like container, a small nearby subtree stands in for the
    // "same authentication flow" check.
    const scope = container ?? fallback;
    return scope ? containsSecretField(scope) : false;
  };
  return (element) => {
    try {
      if (!element || read(getNodeType, element, "nodeType") !== 1) return false;
      const tag = String(read(getLocalName, element, "localName") ?? "").toLowerCase();
      if (tag !== "input" && tag !== "textarea" &&
        read(getIsContentEditable, element, "isContentEditable") !== true) {
        return false;
      }
      const field = (
        rawAttribute(element, "name") || rawAttribute(element, "id") ||
        rawAttribute(element, "aria-label") || rawAttribute(element, "placeholder")
      ).slice(0, 64);
      const match = (reason) => (field ? { reason, field } : { reason });
      const autocomplete = attribute(element, "autocomplete");
      if (attribute(element, "type") === "password") return match("password-type");
      if (CREDENTIAL_AUTOCOMPLETE.includes(autocomplete)) return match("credential-autocomplete");
      if (SECRET_PATTERN.test(describedAttributes(element))) return match("credential-keyword");
      if (autocomplete === "username") return match("credential-autocomplete");
      if (IDENTIFIER_PATTERN.test(describedAttributes(element)) && inAuthenticationContext(element)) {
        return match("identifier-in-auth-context");
      }
      return false;
    } catch {
      // Fail closed: a page that breaks detection is treated as a credential surface.
      return { reason: "detection-error" };
    }
  };
})()`;

// Runtime.callFunctionOn declaration classifying the bound element.
export const IS_CREDENTIAL_INPUT_FUNCTION = String.raw`function() {
  const classifyCredentialInput = ${CREDENTIAL_INPUT_CLASSIFIER_SNIPPET};
  return classifyCredentialInput(this);
}`;

// Classifies the focused element before trusted key events reach the page. The
// activeElement read goes through the Document prototype getter so a hostile
// page cannot present a benign decoy via an own property on document.
export const ACTIVE_CREDENTIAL_INPUT_EXPRESSION = String.raw`(() => {
  const classifyCredentialInput = ${CREDENTIAL_INPUT_CLASSIFIER_SNIPPET};
  try {
    const activeElementGetter = typeof Document === "function"
      ? Object.getOwnPropertyDescriptor(Document.prototype, "activeElement")?.get
      : undefined;
    return classifyCredentialInput(
      activeElementGetter ? activeElementGetter.call(document) : document.activeElement,
    );
  } catch {
    return { reason: "detection-error" };
  }
})()`;

// Classifies the whole page: the first credential field found, or `false`.
// Guards browser_evaluate so arbitrary page expressions cannot become an
// alternate input channel on a login or verification page.
export const HAS_CREDENTIAL_INPUT_EXPRESSION = String.raw`(() => {
  const classifyCredentialInput = ${CREDENTIAL_INPUT_CLASSIFIER_SNIPPET};
  try {
    const querySelectorAll = typeof Document === "function" &&
      typeof Document.prototype.querySelectorAll === "function"
      ? Document.prototype.querySelectorAll
      : document.querySelectorAll;
    const fields = querySelectorAll.call(document, "input, textarea, [contenteditable]");
    for (let index = 0; index < fields.length; index += 1) {
      const classification = classifyCredentialInput(fields[index]);
      if (classification !== false) return classification;
    }
    return false;
  } catch {
    return { reason: "detection-error" };
  }
})()`;
