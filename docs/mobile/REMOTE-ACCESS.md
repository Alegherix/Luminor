# Remote access for the Luminor Android app

This runbook exposes the standalone Luminor server to a native Android client.
There is no mobile-specific server process. The existing `apps/server` listener
already speaks HTTP and the feature WebSocket on one port.

Direct Tailscale mode is plaintext HTTP/WS on the application listener. Tailscale
encrypts the network path; `LUMINOR_ALLOW_INSECURE_REMOTE=1` is the explicit
acknowledgement that the Node listener itself is not TLS.

The safer production-shaped alternative is an HTTPS/WSS reverse proxy with
`LUMINOR_PUBLIC_URL=https://…` and no insecure-remote flag. The backend does
not terminate TLS.

## Security invariants

- `LUMINOR_AUTH_TOKEN` is a startup/policy secret. It must never appear in a
  client URL, pairing link, log-forwarded location header, or mobile setting.
- The legacy `?token=` WebSocket query is loopback-only by design and must stay
  that way. A matching token is still rejected on a non-loopback bind. Do not
  put `LUMINOR_AUTH_TOKEN` in a remote URL.
- Native authentication is one-time pairing → bearer session → short-lived
  `wsToken`. HTTP calls use `Authorization: Bearer <session-token>`. The
  feature socket uses `?wsToken=<ticket>` only.
- The startup pairing URL uses a URL fragment (`/pair#token=<one-time>`). That
  fragment is the one-time pairing credential, not `LUMINOR_AUTH_TOKEN`. The
  fragment is deliberately not sent as an HTTP query.

## Exact environment (Tailscale)

```bash
LUMINOR_HOST=<tailnet-ipv4>          # from `tailscale ip -4`; not 127.0.0.1
LUMINOR_PORT=3773                    # fixed; do not let web mode pick a free port
LUMINOR_AUTH_TOKEN=<64-hex-chars>    # high-entropy; never put this in a URL
LUMINOR_ALLOW_INSECURE_REMOTE=1      # required for direct plaintext remote bind
LUMINOR_NO_BROWSER=1                 # headless; do not auto-open a browser
```

Equivalent CLI:

```bash
bun run --cwd apps/server dev -- \
  --host <tailnet-ipv4> \
  --port 3773 \
  --auth-token <64-hex-chars> \
  --allow-insecure-remote \
  --no-browser
```

Optional, emulator-only (see [Android emulator](#android-emulator)):

```bash
LUMINOR_TRUSTED_ORIGINS=http://10.0.2.2:3773
```

`0.0.0.0` binds every host interface, not just Tailscale. Prefer the machine's
Tailnet IPv4. A wildcard startup log that prints `localhost` is not proof the
phone can reach that URL — configure the app with the Tailnet IP or MagicDNS
name.

Do not combine a remote bind with `VITE_DEV_SERVER_URL`. Remote policy rejects
that mix. A phone deployment should use this standalone server (built web root
optional). The native app does not need the static web bundle.

Reuse `LUMINOR_HOME` only when you intend to share the same projects/threads as
that data directory. Do not point this listener at a home directory that another
Luminor process already has open.

## Launch script

From the repository root:

```bash
./scripts/serve-tailnet.sh
```

The script generates a high-entropy `LUMINOR_AUTH_TOKEN` when unset, resolves
`LUMINOR_HOST` from `tailscale ip -4` when unset, and starts the standalone
server headless with the environment above.

```bash
LUMINOR_PORT=3773 LUMINOR_HOME="$HOME/.luminor" ./scripts/serve-tailnet.sh
./scripts/serve-tailnet.sh --emulator   # also allow RN Origin http://10.0.2.2:<port>
```

If Tailscale is missing or has no IPv4 address, the script exits with a
fallback message. Set `LUMINOR_HOST` yourself (Tailnet IP or MagicDNS) and
rerun.

## Obtain the one-time pairing credential

On a non-loopback bind the server creates a startup pairing link and logs it:

```text
Insecure remote pairing link created
  pairingUrl: http://<tailnet-ip>:<port>/pair#token=<one-time-credential>
  hint: Open this one-time URL to establish the first owner session.
```

Copy only the fragment value after `token=`. That is the pairing credential.
It is not `LUMINOR_AUTH_TOKEN` and it must not be rewritten onto `?token=`.

An already-authenticated owner session can mint additional pairing credentials
with `POST /api/auth/pairing-token`. The native app should still redeem them
at the bearer endpoint below, not the cookie bootstrap.

## Native auth sequence

Base URL: `http://<tailnet-host>:<port>` (emulator: `http://10.0.2.2:<port>`).

1. Pair once:

   ```bash
   curl -sS -X POST "$BASE/api/auth/bootstrap/bearer" \
     -H 'Content-Type: application/json' \
     --data '{"credential":"<one-time-credential>"}'
   ```

   Response shape (`AuthBearerBootstrapResult`):

   ```json
   {
     "authenticated": true,
     "role": "owner",
     "sessionMethod": "bearer-session-token",
     "expiresAt": "…",
     "sessionToken": "<store-in-android-secure-storage>"
   }
   ```

2. For every authenticated HTTP call, send `Authorization: Bearer <sessionToken>`.
   Native stacks are not subject to browser CORS. Bearer mutations are allowed
   without an `Origin` header.

3. Before each feature-socket connect (including reconnect), mint a short-lived
   ticket and keep it in memory only:

   ```bash
   curl -sS -X POST "$BASE/api/auth/ws-token" \
     -H "Authorization: Bearer <sessionToken>"
   ```

   Response shape (`AuthWebSocketTokenResult`): `{ "token": "…", "expiresAt": "…" }`.

4. `GET $BASE/ws/negotiate` with the compatibility query from
   `@luminor/contracts` `wsCompatibility`. Fall back to legacy `GET /ws/bootstrap`
   if the server build lacks HTTP negotiate.

5. Connect one feature socket at:

   ```text
   ws://<host>:<port>/ws?<compatibility-query>&wsToken=<ticket>
   ```

   Never add `token=<LUMINOR_AUTH_TOKEN>`.

First reachability check: `GET $BASE/health` (unauthenticated). A healthy
response does not prove authenticated WebSocket access.

## Android emulator

The emulator's `127.0.0.1` is the emulator, not the host. The conventional
alias for the host loopback is `10.0.2.2`.

Host server:

```bash
LUMINOR_HOST=127.0.0.1
LUMINOR_PORT=3773
LUMINOR_AUTH_TOKEN=<64-hex-chars>
LUMINOR_NO_BROWSER=1
LUMINOR_TRUSTED_ORIGINS=http://10.0.2.2:3773
```

A loopback bind does not require `LUMINOR_ALLOW_INSECURE_REMOTE`. It does
require `LUMINOR_TRUSTED_ORIGINS` for React Native (see [Origin](#origin-verification)).

App base URL: `http://10.0.2.2:3773`.

Pairing still uses `POST /api/auth/bootstrap/bearer`. On loopback the server
does not print a startup pairing URL; create a pairing credential from an
already-running owner session (`POST /api/auth/pairing-token`) or start the
same data directory once on the tailnet to obtain the logged fragment.

Alternatively, point the emulator at the host Tailnet IP (`http://<tailnet-ip>:<port>`)
using the Tailscale environment above. That path does not need
`LUMINOR_TRUSTED_ORIGINS` because React Native's default Origin is same-origin
with `LUMINOR_HOST`.

## Galaxy S24 (Tailscale)

1. Install and log into Tailscale on the phone and on the machine running
   `./scripts/serve-tailnet.sh`.
2. Confirm the phone can open `http://<tailnet-ip>:3773/health`.
3. In the app, set the server URL to `http://<tailnet-ip>:3773` (or the
   machine's MagicDNS name and the same port).
4. Redeem the one-time `#token=` pairing credential via
   `POST /api/auth/bootstrap/bearer`.
5. Store the bearer session; mint `wsToken` tickets for `/ws`.

Do not type `LUMINOR_AUTH_TOKEN` into the app. Do not use `localhost` or a
`luminor://` desktop URL from the phone.

## Origin verification

Gate: `apps/server/src/trustedOrigins.ts` (`shouldRejectUntrustedRequestOrigin`).
Absent `Origin` is treated as a non-browser client and allowed. A present
`Origin` is normalized; `null`, malformed, and unrelated values are rejected.
Same-origin is trusted when the request host is loopback, equals `LUMINOR_HOST`,
or the server is wildcard-bound.

React Native's Android WebSocket (OkHttp `WebSocketModule`) always sends
`Origin`. If JS does not override headers it uses `getDefaultOrigin(url)`:
`ws://host:port` → `http://host:port`, `wss://host:port` → `https://host:port`.
The header cannot be omitted; it can only be overridden.

Probed against a standalone loopback server
(`LUMINOR_HOST=127.0.0.1`, `LUMINOR_PORT=58921`, `LUMINOR_AUTH_TOKEN` set,
`/health` 200). Origin is checked before compatibility and auth, so **403
Forbidden** means the origin gate rejected the upgrade and **426** means the
origin was accepted (compatibility then failed because the probe sent no
negotiate query):

| Upgrade headers                                          | `/ws` status | Meaning                                                    |
| -------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| no `Origin`                                              | 426          | accepted (expected non-browser path)                       |
| `Origin: null`                                           | 403          | rejected                                                   |
| `Origin: http://localhost`                               | 403          | rejected (unrelated)                                       |
| `Origin: http://127.0.0.1:58921`                         | 426          | accepted (same-origin loopback)                            |
| `Origin: http://10.0.2.2:58921`                          | 403          | rejected on loopback bind                                  |
| `Host: 10.0.2.2:58921` + `Origin: http://10.0.2.2:58921` | 403          | rejected (emulator RN default vs `LUMINOR_HOST=127.0.0.1`) |
| `Origin: https://evil.example`                           | 403          | rejected                                                   |

`GET /ws/negotiate` matched the same accept/reject split.

Therefore a real React Native Android client:

- **Galaxy S24 / Tailnet** (`ws://<tailnet-ip>:<port>` →
  `Origin: http://<tailnet-ip>:<port>`): accepted when `LUMINOR_HOST` is that
  Tailnet IP. No allowlist entry required.
- **Emulator** (`ws://10.0.2.2:<port>` → `Origin: http://10.0.2.2:<port>`
  against a loopback server): rejected without an exact allowlist entry.

The contingency allowlist is that emulator case. Configure exact normalized
origins only:

```bash
LUMINOR_TRUSTED_ORIGINS=http://10.0.2.2:3773
# or: --trusted-origins http://10.0.2.2:3773
```

Never `*`. Never `null`. The parser rejects both at startup. `Origin: null`
remains rejected even when an allowlist is configured.

## HTTPS / WSS (optional)

Terminate TLS in a reverse proxy. Set
`LUMINOR_PUBLIC_URL=https://luminor.example.com` (HTTPS root origin, no path,
query, userinfo, or fragment). Do not set `--allow-insecure-remote`. Point the
app at `https://…` / `wss://…`. The backend listener stays plain HTTP behind
the proxy.
