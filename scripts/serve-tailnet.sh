#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/serve-tailnet.sh [--emulator]

Start the standalone Luminor server for Tailscale / Android access.

Environment (all optional; the script fills defaults):
  LUMINOR_HOST          Tailnet IPv4. Default: first address from `tailscale ip -4`.
  LUMINOR_PORT          Fixed listen port. Default: 3773.
  LUMINOR_AUTH_TOKEN    Startup policy secret. Generated when unset. Never a client URL.
  LUMINOR_HOME          Server data directory. Inherited when already set.
  LUMINOR_TRUSTED_ORIGINS
                        Comma-separated exact Origin values. --emulator sets
                        http://10.0.2.2:<port> when this is unset.

The script always sets LUMINOR_ALLOW_INSECURE_REMOTE=1 and LUMINOR_NO_BROWSER=1.
EOF
}

emulator=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --emulator)
      emulator=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

port="${LUMINOR_PORT:-3773}"
if [[ ! "${port}" =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
  printf 'LUMINOR_PORT must be an integer 1-65535 (got %s).\n' "${port}" >&2
  exit 1
fi

host="${LUMINOR_HOST:-}"
if [[ -z "${host}" ]]; then
  if ! command -v tailscale >/dev/null 2>&1; then
    cat >&2 <<'EOF'
Unable to resolve a Tailscale IPv4 address: `tailscale` is not on PATH.

Install Tailscale, run `tailscale up`, then retry.
Or set LUMINOR_HOST to this machine's tailnet IPv4 or MagicDNS name.
EOF
    exit 1
  fi

  tailnet_ip=""
  if ! tailnet_ip="$(tailscale ip -4 2>/dev/null | awk 'NR==1 { print; exit }')"; then
    tailnet_ip=""
  fi
  if [[ -z "${tailnet_ip}" ]]; then
    cat >&2 <<'EOF'
Unable to resolve a Tailscale IPv4 address (`tailscale ip -4` returned nothing).

Run `tailscale up` and confirm `tailscale status`, then retry.
Or set LUMINOR_HOST to this machine's tailnet IPv4 or MagicDNS name.
EOF
    exit 1
  fi
  host="${tailnet_ip}"
fi

if [[ -z "${LUMINOR_AUTH_TOKEN:-}" ]]; then
  if ! command -v openssl >/dev/null 2>&1; then
    printf 'openssl is required to generate LUMINOR_AUTH_TOKEN.\n' >&2
    exit 1
  fi
  LUMINOR_AUTH_TOKEN="$(openssl rand -hex 32)"
  generated_token=1
else
  generated_token=0
fi

if [[ "${emulator}" -eq 1 && -z "${LUMINOR_TRUSTED_ORIGINS:-}" ]]; then
  LUMINOR_TRUSTED_ORIGINS="http://10.0.2.2:${port}"
  export LUMINOR_TRUSTED_ORIGINS
fi

export LUMINOR_HOST="${host}"
export LUMINOR_PORT="${port}"
export LUMINOR_AUTH_TOKEN
export LUMINOR_ALLOW_INSECURE_REMOTE=1
export LUMINOR_NO_BROWSER=1

cat <<EOF
Starting Luminor for tailnet access
  LUMINOR_HOST=${LUMINOR_HOST}
  LUMINOR_PORT=${LUMINOR_PORT}
  LUMINOR_ALLOW_INSECURE_REMOTE=1
  LUMINOR_NO_BROWSER=1
  health: http://${LUMINOR_HOST}:${LUMINOR_PORT}/health
  app URL (phone): http://${LUMINOR_HOST}:${LUMINOR_PORT}
  app URL (emulator): http://10.0.2.2:${LUMINOR_PORT}
EOF

if [[ "${generated_token}" -eq 1 ]]; then
  printf '  LUMINOR_AUTH_TOKEN: generated (not printed; export it to reuse this secret)\n'
else
  printf '  LUMINOR_AUTH_TOKEN: using the value already in the environment\n'
fi

if [[ -n "${LUMINOR_TRUSTED_ORIGINS:-}" ]]; then
  printf '  LUMINOR_TRUSTED_ORIGINS=%s\n' "${LUMINOR_TRUSTED_ORIGINS}"
fi

cat <<'EOF'

LUMINOR_AUTH_TOKEN must never appear in a client URL. The legacy ?token= query
is loopback-only and is rejected on this bind.

When the server is up, copy the one-time pairing credential from the log line
`pairingUrl` (the #token= fragment only). Redeem it with
POST /api/auth/bootstrap/bearer — do not open it as ?token=.
EOF

cd "${repo_root}"

if command -v bun >/dev/null 2>&1; then
  exec bun run --cwd "${repo_root}/apps/server" src/index.ts
fi

if [[ -f "${repo_root}/apps/server/dist/index.mjs" ]]; then
  exec node "${repo_root}/apps/server/dist/index.mjs"
fi

printf 'Need bun, or a built apps/server/dist/index.mjs.\n' >&2
exit 1
