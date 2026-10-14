#!/usr/bin/env bash
set -Eeuo pipefail
cd "$1"
shift

mode=${1:-all}
branch=${2:-main}
expected=${3:-}
case "$mode" in all|server|web) ;; *) echo 'Usage: bash scripts/deploy.sh all|server|web [branch] [commit]'; exit 2;; esac
[[ "$branch" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]*$ ]] || { echo 'Invalid branch'; exit 2; }
[[ -z "$expected" || "$expected" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit'; exit 2; }
for command in git docker flock; do command -v "$command" >/dev/null || { echo "Missing: $command"; exit 1; }; done
[[ -f .env ]] || { echo 'Create .env from .env.server.example first'; exit 1; }
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Server checkout has local changes; resolve them before deployment'; exit 1; }
[[ "$(git branch --show-current)" == "$branch" ]] || { echo "Switch to branch $branch first"; exit 1; }
docker info >/dev/null
git fetch origin "$branch"
remote_commit=$(git rev-parse FETCH_HEAD)
[[ -z "$expected" || "$remote_commit" == "$expected" ]] || { echo 'Remote branch differs from the generated release. Generate a new release script.'; exit 1; }
git merge --ff-only "$remote_commit"
commit=$(git rev-parse HEAD)
[[ "$commit" == "$remote_commit" ]] || { echo 'Server has local commits ahead of remote'; exit 1; }
mkdir -p .releases
release_id="$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}-$mode"
export RELEASE_IMAGE="gofishing:$release_id"
compose=(docker compose --env-file .env -f compose.yaml -f compose.server.yaml -f compose.release.yaml)
"${compose[@]}" config --quiet

container=$("${compose[@]}" ps -q app)
previous_id=''
if [[ -n "$container" ]]; then previous_id=$(docker inspect --format '{{.Image}}' "$container"); fi
previous_tag="gofishing:before-$release_id"
if [[ -n "$previous_id" ]]; then docker image tag "$previous_id" "$previous_tag"; fi
if [[ "$mode" != all && -z "$previous_id" ]]; then echo 'First deployment must use all'; exit 1; fi

args=(docker build -f Dockerfile.publish --target "$mode" -t "$RELEASE_IMAGE")
if [[ "$mode" != all ]]; then args+=(--build-arg "PREVIOUS_IMAGE=$previous_tag"); fi
"${args[@]}" .

wait_healthy() {
  local id status
  for ((attempt=0; attempt<60; attempt++)); do
    id=$("${compose[@]}" ps -q app)
    if [[ -n "$id" ]]; then
      status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")
      [[ "$status" == healthy ]] && return 0
      [[ "$status" == unhealthy || "$status" == exited ]] && return 1
    fi
    sleep 2
  done
  return 1
}

rollback() {
  local result=$?
  trap - ERR
  echo 'Deployment failed. Checking previous application image.'
  if [[ -n "$previous_id" ]]; then
    export RELEASE_IMAGE="$previous_tag"
    "${compose[@]}" up -d --no-build --no-deps app && wait_healthy || echo 'Rollback needs manual inspection'
  fi
  echo 'See docker compose logs; database/data changes are not rolled back.'
  exit "$result"
}
trap rollback ERR
"${compose[@]}" up -d --no-build --no-deps app
wait_healthy
"${compose[@]}" up -d --no-build --force-recreate --no-deps caddy
printf 'RELEASE_IMAGE=%s\n' "$RELEASE_IMAGE" > .release.env
printf 'commit=%s\nmode=%s\nimage=%s\nprevious=%s\n' "$commit" "$mode" "$RELEASE_IMAGE" "$previous_tag" > ".releases/$release_id.txt"
trap - ERR
echo "Published: $RELEASE_IMAGE"
echo 'Check your HTTPS domain and /api/health. See docs/GitHub发布流程.md.'
