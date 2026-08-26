#!/bin/sh
# Cut icon.icns from icon.svg. macOS-only: qlmanage rasterizes the SVG through
# WebKit, sips derives each representation, and iconutil packs the iconset.
# Regenerate icon.svg first (`node apps/desktop/build/gen-icon.mjs`) whenever
# the source favicon changes.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

qlmanage -t -s 1024 -o "$work" "$here/icon.svg" >/dev/null 2>&1
master="$work/icon.svg.png"
[ -f "$master" ] || { echo "make-icns: qlmanage produced no thumbnail" >&2; exit 1; }

mkdir "$work/icon.iconset"
# Every representation macOS asks for, from the menu bar to Finder's largest preview.
for spec in \
	'16 icon_16x16' '32 icon_16x16@2x' \
	'32 icon_32x32' '64 icon_32x32@2x' \
	'128 icon_128x128' '256 icon_128x128@2x' \
	'256 icon_256x256' '512 icon_256x256@2x' \
	'512 icon_512x512' '1024 icon_512x512@2x'
do
	size=${spec%% *}
	name=${spec##* }
	sips -z "$size" "$size" "$master" --out "$work/icon.iconset/$name.png" >/dev/null
done

iconutil -c icns "$work/icon.iconset" -o "$here/icon.icns"
echo "make-icns: wrote $here/icon.icns"
