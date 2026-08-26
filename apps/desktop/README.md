# dsh desktop (macOS)

A macOS `.app`/`.dmg` that runs the `dsh` web profile in an Electron window, so the harness can be installed and launched like a desktop application instead of a terminal command.

This directory is **source only, and deliberately not a workspace package** — it carries no `package.json`, so `pnpm` does not treat it as an `apps/*` member and the build cannot perturb the lockfile or workspace hoisting. The build assembles its own throwaway project in a scratch directory from [`package.template.json`](package.template.json) and a deployed dependency closure. Nothing here is wired into `pnpm run build`; the packaging run is manual and macOS-only.

## How it is put together

The shell ([`main.js`](main.js)) does not host the agent in Electron's own Node. It spawns `dsh` as a child process under a **separately bundled Node runtime**, waits for the host to print its listening address, and points a `BrowserWindow` at it:

```
Electron main  ──spawn──▶  node (bundled)  lib/bin.js --profile web --no-open --port 0
      │                          │
      │                    stdout: "dsh web: http://127.0.0.1:<port>"
      └────────BrowserWindow.loadURL(url)◀───┘
```

Electron's Node is not interchangeable here: `node-pty` is compiled against a different ABI, so terminal sessions fail inside Electron and work under a stock Node of the same major version. The child receives `DSH_HOME=app.getPath('userData')` so a packaged install keeps its state out of the developer's `~/.dsh`.

The window is opened only once the banner is parsed, which is why startup shows a few seconds of no window rather than an empty one.

## Layout

| Path | Role |
|---|---|
| `main.js` | Electron main process: spawns the host, parses the banner, owns window and child lifecycle. |
| `package.template.json` | The electron-builder project manifest, copied into the scratch build root as `package.json`. |
| `stage-manifest.json` | Dependency closure the host needs at runtime — see [Refreshing the closure](#refreshing-the-closure). |
| `stage-workspace.yaml` | `pnpm-workspace.yaml` for the scratch root: workspace globs plus the build allowlist. |
| `build/icon.svg` | 1024px master artwork, generated. |
| `build/icon.icns` | Compiled icon, generated; electron-builder's auto-detected path. |
| `build/gen-icon.mjs` | Composes `icon.svg` from the site favicon. |
| `build/path-bbox.mjs` | Headless `getBBox()` equivalent used to centre the glyph. |
| `build/make-icns.sh` | Cuts `icon.icns` from `icon.svg`. |

## The icon

The glyph has one home in this repository — [`website/public/favicon.svg`](../../website/public/favicon.svg) — and the icon is derived from it rather than redrawing or duplicating the path. `gen-icon.mjs` measures the path's true bounding box, then centres it at 62% of the body width on Apple's macOS icon grid: a 1024px canvas with an 824px rounded-rect body at radius 185. A hairline of brand blue at 13% opacity keeps the white body from dissolving into a light desktop.

Both outputs are committed because the build consumes them and `make-icns.sh` needs macOS tooling. Regenerate after the favicon changes:

```sh
node apps/desktop/build/gen-icon.mjs && ./apps/desktop/build/make-icns.sh
```

## Building

Requires macOS on the target architecture, a stock Node matching the repo's engines range, and a warm pnpm store. Every step below was run to produce a verified `arm64` build.

1. **Scratch root.** Create a build directory outside the repository. Copy `package.template.json` to `<root>/electron-app/package.json`, `stage-manifest.json` to `<root>/package.json`, and `stage-workspace.yaml` to `<root>/pnpm-workspace.yaml`. Symlink every workspace package into `<root>/workspace/`.

2. **Deploy the closure.** `stage/` becomes a self-contained, hoisted `node_modules` tree:

   ```sh
   pnpm deploy --legacy --prod --offline --config.node-linker=hoisted \
     --config.auto-install-peers=false --config.link-workspace-packages=true \
     --config.confirm-modules-purge=false --filter dsh-app-build <root>/stage
   ```

   Then copy `apps/cli/lib` to `<root>/stage/lib` and `apps/cli/config` to `<root>/stage/config`, and delete `<root>/stage/node_modules/.bin`. **`lib/*.js` must sit in `stage/lib/`, not the stage root** — the chunks resolve `../package.json` to reach the manifest.

3. **Node runtime.** Unpack an official `node-<version>-darwin-<arch>` tarball to `<root>/node-runtime`, trimmed to `bin/node`.

4. **Electron dist.** Unpack the matching Electron release to `<root>/electron-dist`; `electronDist` points the builder at it instead of re-downloading.

5. **Package.**

   ```sh
   CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --arm64
   ```

6. **Apply the repairs below**, then re-cut the `.dmg` from the repaired bundle:

   ```sh
   CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --arm64 \
     --prepackaged "dist/mac-arm64/DeepSeek Harness.app"
   ```

## Repairs the packaging step still needs

Four behaviours cost a rebuild each; none is worked around by configuration alone.

- **electron-builder strips `node_modules` out of `extraResources`,** even with `filter: ["**/*"]`. The staged closure has to be restored after packing: `rsync -a --delete <root>/stage/ "<app>/Contents/Resources/app/"`.
- **The staged manifest declares `"type": "module"`,** which breaks a CommonJS Electron entry sharing that directory. The shell is installed as `Resources/app/main.cjs` and `Resources/app/package.json` gains `"main": "main.cjs"`.
- **`--prepackaged` takes the `.app` bundle, not its parent.** Given a directory it copies that directory *as* the app and produces a nested `DeepSeek Harness.app/DeepSeek Harness.app`.
- **Editing `Info.plist` invalidates the signature.** Re-sign afterwards. A top-level `codesign --force -s - "<app>"` is enough and fast; `--deep` over the full tree takes minutes and is not needed, because the nested Node binary carries its own signature.

## Refreshing the closure

`stage-manifest.json` is a snapshot: the union of the runtime dependencies of `apps/cli`, `packages/bundle/web-app`, `packages/bundle/base`, and `python/sdk-runtime`. Refresh it when those manifests change.

A naive union is wrong. `@deepseek-ai/dsh-session-title-llm` and `@deepseek-ai/dsh-session-telemetry` are reached only as peer dependencies and must be added explicitly — without them the host boots but loses session titling and telemetry.

## Signing status

Builds are **ad-hoc signed** (`codesign -s -`), which is enough to launch on the machine that built them. Distribution needs a Developer ID signature and notarization; without them Gatekeeper quarantines the `.dmg` on any other Mac.
