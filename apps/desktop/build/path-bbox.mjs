/**
 * Tight bounding box of an SVG path's `d` attribute.
 *
 * The icon composer centres the whale on its drawn extent rather than on the
 * source viewBox, which carries asymmetric slack. Browsers expose this as
 * `SVGGraphicsElement.getBBox()`, but that needs a live document; this module
 * is the headless equivalent for the build.
 *
 * Only `M`/`C`/`Z` and their relative forms appear in the DeepSeek whale, but
 * the parser also accepts `L`/`H`/`V`/`S` so a future logo revision does not
 * silently mis-measure. Cubic segments are flattened by sampling because the
 * extremum solution is not needed at icon resolutions: 500 samples per curve
 * hold the error far below one device pixel at 1024px.
 */

const SAMPLES = 500

/**
 * Compute the bounding box of a path definition.
 * @param d - the `d` attribute of an SVG `<path>`.
 * @returns the box in user units, plus its width and height.
 * @throws if `d` uses a command this parser does not implement.
 */
export function pathBBox(d) {
	const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
	let i = 0
	let cx = 0
	let cy = 0
	let startX = 0
	let startY = 0
	let ctrlX = 0
	let ctrlY = 0
	let cmd = null
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	const mark = (x, y) => {
		if (x < minX) minX = x
		if (x > maxX) maxX = x
		if (y < minY) minY = y
		if (y > maxY) maxY = y
	}
	const num = () => Number.parseFloat(toks[i++])
	const cubic = (x1, y1, x2, y2, x, y) => {
		for (let s = 0; s <= SAMPLES; s += 1) {
			const t = s / SAMPLES
			const u = 1 - t
			mark(
				u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
				u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
			)
		}
		ctrlX = x2
		ctrlY = y2
		cx = x
		cy = y
	}

	while (i < toks.length) {
		if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++]
		const relative = cmd === cmd.toLowerCase()
		const ox = relative ? cx : 0
		const oy = relative ? cy : 0
		switch (cmd.toUpperCase()) {
			case 'M':
				cx = num() + ox
				cy = num() + oy
				startX = cx
				startY = cy
				mark(cx, cy)
				// A second coordinate pair after M is an implicit lineto.
				cmd = relative ? 'l' : 'L'
				break
			case 'L':
				cx = num() + ox
				cy = num() + oy
				mark(cx, cy)
				break
			case 'H':
				cx = num() + ox
				mark(cx, cy)
				break
			case 'V':
				cy = num() + oy
				mark(cx, cy)
				break
			case 'C': {
				const x1 = num() + ox
				const y1 = num() + oy
				const x2 = num() + ox
				const y2 = num() + oy
				cubic(x1, y1, x2, y2, num() + ox, num() + oy)
				break
			}
			case 'S': {
				const x1 = 2 * cx - ctrlX
				const y1 = 2 * cy - ctrlY
				const x2 = num() + ox
				const y2 = num() + oy
				cubic(x1, y1, x2, y2, num() + ox, num() + oy)
				break
			}
			case 'Z':
				cx = startX
				cy = startY
				break
			default:
				throw new Error(`path-bbox: unsupported command "${cmd}"`)
		}
	}
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
