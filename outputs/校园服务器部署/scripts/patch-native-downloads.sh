#!/usr/bin/env bash
# Reviewable root-only route patch; no application restart or data migration.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run as root from the server console.' >&2; exit 1; }
ACTION=check; GAME_HOST=; WORKSPACE=; OWNER=codex
if [[ ${1:-} == apply || ${1:-} == check || ${1:-} == restore ]]; then ACTION=$1; shift; fi
while [ "$#" -gt 0 ]; do
 case "$1" in
  --host) GAME_HOST=${2:?Missing --host}; shift 2 ;;
  --workspace) WORKSPACE=${2:?Missing --workspace}; shift 2 ;;
  --owner) OWNER=${2:?Missing --owner}; shift 2 ;;
  *) echo 'Use check|apply --host <game-host> --workspace <server-root> [--owner <user>], or restore.' >&2; exit 2 ;;
 esac
done
FILE=/etc/caddy/qisheng-sites.caddy
BASE=/var/lib/qisheng-gateway/native-downloads
PATCH="$(dirname "$0")/patch-native-downloads.py"
if [[ "$ACTION" == check || "$ACTION" == apply ]]; then
 [ -n "$GAME_HOST" ] && [ -n "$WORKSPACE" ] || { echo '--host and --workspace are required.' >&2; exit 2; }
 [[ "$OWNER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo 'Invalid owner.' >&2; exit 2; }
 python3 "$PATCH" "$FILE" --host "$GAME_HOST" --workspace "$WORKSPACE" --check
 if [ "$ACTION" == check ]; then echo 'Read-only route check completed; nothing changed.'; exit 0; fi
fi
mkdir -p "$BASE"; chmod 700 "$BASE"
SNAPSHOT=$(mktemp "$BASE/action.XXXXXX")
cp -a "$FILE" "$SNAPSHOT"
CHANGED=0; COMMITTED=0; CREATED=0
recover() {
 if [ "$CHANGED" -eq 1 ] && [ "$COMMITTED" -eq 0 ]; then cp -a "$SNAPSHOT" "$FILE"; /usr/bin/systemctl reload caddy.service || true; fi
 if [ "$CREATED" -eq 1 ] && [ "$COMMITTED" -eq 0 ]; then rm -f -- "$BASE/before.caddy" "$BASE/after.sha256"; fi
 rm -f -- "$SNAPSHOT"
}
trap recover EXIT
if [ "$ACTION" == apply ]; then
 [ ! -e "$BASE/before.caddy" ] || {
  [ -f "$BASE/after.sha256" ] && [ "$(sha256sum "$FILE" | cut -d ' ' -f 1)" == "$(cat "$BASE/after.sha256")" ] || { echo 'A newer config exists; review before patching.' >&2; exit 1; }
  echo 'Native download route already active; no changes.'; exit 0;
 }
 cp -a "$FILE" "$BASE/before.caddy"; chmod 600 "$BASE/before.caddy"; CREATED=1; CHANGED=1
 RESULT=$(python3 "$PATCH" "$FILE" --host "$GAME_HOST" --workspace "$WORKSPACE")
 chown root:caddy "$FILE"; chmod 640 "$FILE"
 /usr/bin/caddy validate --config /etc/caddy/Caddyfile
 install -d -o "$OWNER" -g "$OWNER" -m 755 "$WORKSPACE/native" "$WORKSPACE/native/releases"
 if [ "$RESULT" == changed ]; then /usr/bin/systemctl reload caddy.service; fi
 sha256sum "$FILE" | cut -d ' ' -f 1 > "$BASE/after.sha256"; chmod 600 "$BASE/after.sha256"
 COMMITTED=1
 echo 'Native archives route installed; existing ZIP/APK paths only. Missing and other paths are no-store. Application services and data unchanged.'
else
 [ -f "$BASE/before.caddy" ] && [ -f "$BASE/after.sha256" ] || { echo 'No completed native download patch to restore.' >&2; exit 1; }
 [ "$(sha256sum "$FILE" | cut -d ' ' -f 1)" == "$(cat "$BASE/after.sha256")" ] || { echo 'Config changed after patch; refusing to overwrite.' >&2; exit 1; }
 cp "$BASE/before.caddy" "$FILE"; CHANGED=1
 chown root:caddy "$FILE"; chmod 640 "$FILE"
 /usr/bin/caddy validate --config /etc/caddy/Caddyfile
 /usr/bin/systemctl reload caddy.service
 COMMITTED=1
 rm -f -- "$BASE/before.caddy" "$BASE/after.sha256"
 echo 'Previous routes restored; application services, archives and database unchanged.'
fi
