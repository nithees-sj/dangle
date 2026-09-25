#!/usr/bin/env bash
# Runs Dangle inside a throwaway headless GNOME Shell and reports the driver's
# results. Uses its own XDG dirs (and so its own dconf), so it never touches
# the settings of your real session.
#
#   tools/headless-test.sh            # all checks
#   DANGLE_TEST_ONLY=sleep,cycle tools/headless-test.sh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${DANGLE_TEST_WORK:-$(mktemp -d -t dangle-test.XXXXXX)}
OUT=$WORK/out
mkdir -p "$OUT"

export XDG_CONFIG_HOME=$WORK/config
export XDG_DATA_HOME=$WORK/data
export XDG_CACHE_HOME=$WORK/cache
export XDG_STATE_HOME=$WORK/state
export DANGLE_TEST_OUT=$OUT
export DANGLE_DEBUG=${DANGLE_DEBUG:-1}

EXT_DIR=$XDG_DATA_HOME/gnome-shell/extensions
mkdir -p "$EXT_DIR"
cp -r "$ROOT/extension" "$EXT_DIR/dangle@nithees"
cp -r "$ROOT/tools/test-driver" "$EXT_DIR/dangle-test@local"

timeout "${DANGLE_TEST_TIMEOUT:-300}" dbus-run-session -- bash -c '
    gsettings set org.gnome.shell enabled-extensions "[\"dangle-test@local\", \"dangle@nithees\"]"
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
    # A virtual pointer starts at (0, 0): the hot corner would open the overview.
    gsettings set org.gnome.desktop.interface enable-hot-corners false
    exec gnome-shell --headless --wayland --no-x11 \
        --virtual-monitor 1920x1080 --wayland-display "dangle-test-$$"
' >"$OUT/shell.log" 2>&1 || true

echo "Work dir: $WORK"
if [[ ! -f $OUT/results.txt ]]; then
    echo "No results: the shell did not finish. Last log lines:"
    tail -n 40 "$OUT/shell.log"
    exit 2
fi

grep -E '^(PASS|FAIL|INFO)' "$OUT/results.txt" | grep -v '^INFO group' || true
echo
echo "Dangle log lines:"
grep -E 'dangle@nithees|Dangle|JS ERROR|JS WARNING' "$OUT/shell.log" | grep -v DANGLE-TEST | tail -n 30 || true
echo
PASSES=$(grep -c '^PASS' "$OUT/results.txt" || true)
FAILS=$(grep -c '^FAIL' "$OUT/results.txt" || true)
echo "Screenshots: $OUT/*.png"
echo "Result: $PASSES passed, $FAILS failed"
[[ $FAILS -eq 0 ]]
