#!/usr/bin/env bash
# Downloads the ArcFace model (w600k_mbf.onnx, ~13 MB) into native/face/assets/models/. CI runs this before patch-android.js.
# NOTE: InsightFace pretrained models are for non-commercial / research use only.
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/native/face/assets/models"
mkdir -p "$DEST"
OUT="$DEST/w600k_mbf.onnx"
MIN=12000000
if [ -s "$OUT" ] && [ "$(stat -c%s "$OUT")" -ge "$MIN" ]; then echo "have w600k_mbf.onnx"; exit 0; fi
TMP="$(mktemp -d)"
echo "downloading buffalo_s.zip (contains w600k_mbf.onnx)"
URL=https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip
# GitHub release downloads sometimes answer 504: try up to 4 rounds, each with its own curl retries, waiting between rounds.
ok=0
for i in 1 2 3 4; do
  if curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors --connect-timeout 30 --max-time 300 -o "$TMP/buffalo_s.zip" "$URL"; then ok=1; break; fi
  echo "download round $i failed, waiting 30 s" >&2; sleep 30
done
[ "$ok" = 1 ] || { echo "ERROR: buffalo_s.zip download failed after 4 rounds" >&2; exit 1; }
unzip -joq "$TMP/buffalo_s.zip" w600k_mbf.onnx -d "$DEST"
rm -rf "$TMP"
[ "$(stat -c%s "$OUT")" -ge "$MIN" ] || { echo "ERROR: w600k_mbf.onnx too small, download failed" >&2; exit 1; }
ls -la "$DEST"
