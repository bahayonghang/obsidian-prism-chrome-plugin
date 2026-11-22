#!/usr/bin/env bash
# Test-only X11 desktop setup. Run inside a fresh xvfb-run display.
# Native action popups need normal window focus and automatic closing behavior.
# SPDX-License-Identifier: GPL-3.0-only
set -euo pipefail

if [[ -z "${DISPLAY:-}" || "$#" -eq 0 ]]; then
  printf '%s\n' 'Usage: xvfb-run ... bash tests/with-window-manager.sh COMMAND [ARGS...]' >&2
  exit 2
fi

unset WAYLAND_DISPLAY
export GDK_BACKEND=x11
export MOZ_ENABLE_WAYLAND=0
mkdir -p test-artifacts
openbox --sm-disable >test-artifacts/window-manager.log 2>&1 &
prism_wm_pid=$!
cleanup() {
  kill "$prism_wm_pid" 2>/dev/null || true
  wait "$prism_wm_pid" 2>/dev/null || true
}
trap cleanup EXIT

prism_wm_ready=0
for ((prism_attempt = 0; prism_attempt < 100; prism_attempt++)); do
  if ! kill -0 "$prism_wm_pid" 2>/dev/null; then
    cat test-artifacts/window-manager.log >&2
    exit 1
  fi
  prism_wm_property=$(xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null || true)
  if [[ "$prism_wm_property" =~ 0x[[:xdigit:]]+ && ! "$prism_wm_property" =~ 0x0$ ]]; then
    prism_wm_ready=1
    break
  fi
  sleep 0.1
done
if [[ "$prism_wm_ready" -ne 1 ]]; then
  printf '%s\n' 'The X11 window manager did not become ready within 10 seconds.' >&2
  cat test-artifacts/window-manager.log >&2
  exit 1
fi

"$@"
