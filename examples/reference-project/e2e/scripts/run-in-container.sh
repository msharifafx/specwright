#!/usr/bin/env bash
# Run the suite in THE SAME CONTAINER CODEBUILD WOULD RUN.
#
#   bash scripts/run-in-container.sh                  # everything
#   bash scripts/run-in-container.sh tests/spike      # just the spike
#
# WHY A CONTAINER AND NOT `pnpm test` ON THE LAPTOP. The laptop has a display
# server, a browser profile, a proxy-free network and the developer's own DNS.
# CodeBuild has none of those. Every difference between "works here" and "works
# there" is one of them, so the local run is done inside the image the pipeline
# would use — same browsers, same libs, same headless path.
#
# THE IMAGE TAG AND THE DEPENDENCY MUST MATCH. The image ships the browser
# builds for exactly its own Playwright version; a mismatched `@playwright/test`
# fails at launch with "Executable doesn't exist". Bump both together, never one.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v1.62.1-noble}"

# Run as the invoking user so `artifacts/` does not come back owned by root.
# That means HOME has to be somewhere writable inside the mount.
HOME_DIR=".container-home"
mkdir -p "$HOME_DIR/bin" artifacts

# `corepack enable` with no argument writes to /usr/bin, which the invoking
# user does not own inside the container. CodeBuild runs as root and would not
# notice; here it is a hard stop. Install the shims somewhere writable instead —
# same pnpm, no root.
BIN="/work/$HOME_DIR/bin"
RUN="export PATH=$BIN:\$PATH && corepack enable --install-directory $BIN && pnpm install --frozen-lockfile && pnpm exec playwright test"

echo "--- image:  $IMAGE"
echo "--- target: ${BASE_DOMAIN:-dev.example.com}"

docker run --rm \
  --ipc=host \
  -u "$(id -u):$(id -g)" \
  -v "$PWD:/work" \
  -w /work \
  -e HOME=/work/"$HOME_DIR" \
  -e CI=true \
  --env-file <(grep -v '^\s*#' .env 2>/dev/null | grep -v '^\s*$' || true) \
  "$IMAGE" \
  bash -c "$RUN ${*:-}"

echo "--- artifacts"
ls -1 artifacts
