#!/usr/bin/env bash
# Vulnerability scan — dependencies, hardcoded secrets, and Dockerfile/IaC
# misconfiguration.
#
#   pnpm scan                  the source tree
#   pnpm scan:image <ref>      a built image, before it is pushed anywhere
#
# The tool is Trivy (Apache-2.0, Aqua Security). It is the only free scanner
# that covers every surface this repo has in one pass: pnpm-lock.yaml,
# hardcoded secrets, the Dockerfile, and the built ARM64 image. `pnpm audit`
# sees dependencies alone; grype and osv-scanner see no secrets and no
# misconfiguration; ECR basic scanning runs *after* the push and reads OS
# packages only, so it can report a bad image but never stop one.
#
# --ignore-unfixed is deliberate. A vulnerability with no released patch is not
# something this repo can clear, and a gate that cannot be cleared is a gate
# somebody switches off. Unfixed findings still surface in `pnpm scan:report`.
set -euo pipefail

TRIVY_VERSION='0.74.0'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# WHERE THE BINARY AND THE DATABASES LIVE — deliberately outside the repo.
#
# Every feature worktree is a separate directory, so a repo-local cache means
# each one re-downloads the binary and ~110MB of vulnerability database. One
# shared location keyed by version fixes that: the pinned version is still a
# property of the commit (TRIVY_VERSION above decides the path), the bytes are
# fetched once per machine. APP_TRIVY_HOME overrides it — a CI runner points it
# at whatever directory it already caches between builds.
TRIVY_HOME="${APP_TRIVY_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/app-workspace/trivy}"
TRIVY_BIN="${TRIVY_HOME}/bin/${TRIVY_VERSION}/trivy"

# The databases come from AWS's public ECR mirror, not ghcr.io. ghcr rate-limits
# anonymous pulls per source IP; a laptop rarely notices, a shared CI egress
# address hits the limit within a few builds and the scan fails with a 429 that
# looks nothing like a rate limit. The mirror carries identical content and has
# no anonymous limit.
DB_REPO='public.ecr.aws/aquasecurity/trivy-db'

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)              ASSET='Linux-64bit' ;;
  Linux-aarch64|Linux-arm64) ASSET='Linux-ARM64' ;;
  Darwin-x86_64)             ASSET='macOS-64bit' ;;
  Darwin-arm64)              ASSET='macOS-ARM64' ;;
  *) echo "ERROR: no trivy build for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

# A pinned binary in .trivy/ rather than a system install: the version is part
# of the repo, so two developers cannot get different findings from the same
# commit, and nobody has to install anything to run the gate.
install_trivy() {
  local base tmp want got
  base="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}"
  tmp="$(mktemp -d)"

  echo "--- fetching trivy ${TRIVY_VERSION} (${ASSET}) ---"
  curl -fsSL -o "${tmp}/trivy.tar.gz"  "${base}/trivy_${TRIVY_VERSION}_${ASSET}.tar.gz"
  curl -fsSL -o "${tmp}/checksums.txt" "${base}/trivy_${TRIVY_VERSION}_checksums.txt"

  # Verify before extracting, not after — an archive is executed by tar the
  # moment it is unpacked.
  want="$(grep -F "trivy_${TRIVY_VERSION}_${ASSET}.tar.gz" "${tmp}/checksums.txt" | awk '{print $1}')"
  if command -v sha256sum >/dev/null 2>&1; then
    got="$(sha256sum "${tmp}/trivy.tar.gz" | awk '{print $1}')"
  else
    got="$(shasum -a 256 "${tmp}/trivy.tar.gz" | awk '{print $1}')"
  fi
  if [ -z "$want" ] || [ "$want" != "$got" ]; then
    rm -rf "$tmp"
    echo "ERROR: checksum mismatch for trivy_${TRIVY_VERSION}_${ASSET}.tar.gz" >&2
    echo "  expected: ${want:-<not listed>}" >&2
    echo "  got:      ${got}" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$TRIVY_BIN")"
  tar -xzf "${tmp}/trivy.tar.gz" -C "$(dirname "$TRIVY_BIN")" trivy
  chmod +x "$TRIVY_BIN"
  rm -rf "$tmp"
}

[ -x "$TRIVY_BIN" ] || install_trivy

common=(
  --cache-dir "${TRIVY_HOME}/db"
  --db-repository "$DB_REPO"
)

# The ignore file belongs to the GATE modes only — `report` has to show what the
# gate suppressed, which it cannot do while honouring the same suppressions.
# It is passed explicitly because trivy looks for .trivyignore in the working
# directory alone, and `pnpm scan` can be run from anywhere in the tree.
ignore=(--ignorefile "${ROOT}/.trivyignore.yaml")

mode="${1:-fs}"
shift || true

case "$mode" in
  fs)
    exec "$TRIVY_BIN" fs "${common[@]}" "${ignore[@]}" \
      --scanners vuln,secret,misconfig \
      --severity HIGH,CRITICAL \
      --ignore-unfixed \
      --exit-code 1 \
      --skip-dirs 'node_modules,dist,coverage,.trivy,.leakcheck' \
      "$ROOT"
    ;;

  # Everything: every severity, dev dependencies included, nothing ignored,
  # exit 0. --include-dev-deps is the important one — trivy suppresses them by
  # default and the gate keeps that default (a vite plugin does not reach a
  # browser), but a compromised build tool is still a supply-chain problem and
  # this is where you look at it.
  report)
    exec "$TRIVY_BIN" fs "${common[@]}" \
      --scanners vuln,secret,misconfig \
      --include-dev-deps \
      --exit-code 0 \
      --skip-dirs 'node_modules,dist,coverage,.trivy,.leakcheck' \
      "$ROOT"
    ;;

  # The image, scanned before it is pushed. Catches the base layer — node:22-alpine
  # ships OS packages that no lockfile scan can see.
  image)
    ref="${1:?usage: scripts/scan.sh image <image-ref>}"
    exec "$TRIVY_BIN" image "${common[@]}" "${ignore[@]}" \
      --scanners vuln,secret \
      --severity HIGH,CRITICAL \
      --ignore-unfixed \
      --exit-code 1 \
      "$ref"
    ;;

  *)
    echo "usage: scripts/scan.sh [fs|report|image <ref>]" >&2
    exit 2
    ;;
esac
