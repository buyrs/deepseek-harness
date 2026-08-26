/**
 * Compose `icon.svg`, the 1024px master artwork the macOS app icon is cut from.
 *
 * The whale glyph has one home in this repository — the site favicon — so this
 * script reads that file rather than carrying its own copy of the path. Run it
 * after the favicon changes, then re-cut `icon.icns` with `make-icns.sh`.
 *
 * Usage: `node apps/desktop/build/gen-icon.mjs [source.svg] [out.svg]`
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { pathBBox } from './path-bbox.mjs'

/** Apple's macOS icon grid: a 824px rounded-rect body centred on a 1024px canvas. */
const CANVAS = 1024
const BODY = 824
/** Corner radius approximating the system squircle at this body size. */
const RADIUS = 185
/** Fraction of the body width the glyph spans; the rest reads as optical margin. */
const GLYPH_WIDTH_RATIO = 0.62
/** DeepSeek brand blue, taken from the favicon. */
const BRAND = '#4D6BFE'

const round = (n) => Math.round(n * 10000) / 10000

/**
 * Build the icon markup for one glyph path.
 * @param d - the `d` attribute of the glyph to centre on the body.
 * @returns the complete SVG document.
 */
export function composeIcon(d) {
	const box = pathBBox(d)
	const inset = (CANVAS - BODY) / 2
	const scale = (BODY * GLYPH_WIDTH_RATIO) / box.width
	const tx = CANVAS / 2 - (box.x + box.width / 2) * scale
	const ty = CANVAS / 2 - (box.y + box.height / 2) * scale
	// The hairline keeps the white body from dissolving into a light desktop;
	// it is inset by half its stroke width so it does not straddle the edge.
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
	<rect x="${inset}" y="${inset}" width="${BODY}" height="${BODY}" rx="${RADIUS}" ry="${RADIUS}" fill="#FFFFFF"/>
	<rect x="${inset + 0.75}" y="${inset + 0.75}" width="${BODY - 1.5}" height="${BODY - 1.5}" rx="${RADIUS - 0.75}" ry="${RADIUS - 0.75}" fill="none" stroke="${BRAND}" stroke-opacity="0.13" stroke-width="1.5"/>
	<g transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale)})">
		<path d="${d}" fill="${BRAND}" fill-rule="nonzero"/>
	</g>
</svg>
`
}

const [source = 'website/public/favicon.svg', out = 'apps/desktop/build/icon.svg'] = process.argv.slice(2)
const match = readFileSync(source, 'utf8').match(/\sd="([^"]+)"/)
if (match === null) throw new Error(`gen-icon: no <path d="…"> found in ${source}`)
writeFileSync(out, composeIcon(match[1]))
process.stdout.write(`gen-icon: wrote ${out} from ${source}\n`)
