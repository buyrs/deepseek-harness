# Agent Note: macOS desktop shell packaging

Status: implemented

## Problem

`dsh` reaches its users as a terminal command. Trying the harness therefore requires a checkout, a package manager, and a working toolchain, which is a poor fit for evaluating a product whose primary surface is already a browser UI — `dsh --profile web` serves a complete frontend and then asks the user to open a URL by hand.

Shipping that surface as a macOS application removes the toolchain from the first run. The obstacle is that the harness is not a self-contained program: it is a plugin closure resolved through a pnpm workspace, and it depends on `node-pty`, a native module compiled against a specific Node ABI.

## Decision

`apps/desktop/` holds an Electron shell that spawns `dsh` as a **child process under a separately bundled stock Node**, parses the listening address the host prints, and points a `BrowserWindow` at it. Electron's own Node never runs harness code.

The ABI is the reason. `node-pty` is built for the Node release the repo targets; loading it inside Electron's runtime breaks terminal sessions. Bundling a second Node runtime costs roughly 120 MB in the image and keeps the harness running on exactly the runtime it is tested against.

The directory is **source only and not a workspace package**. It carries no `package.json`, so `apps/*` does not pick it up, and a packaging run cannot perturb `pnpm-lock.yaml` or workspace hoisting. The build assembles a throwaway project in a scratch directory from `package.template.json`, `stage-manifest.json`, and `stage-workspace.yaml`. Nothing is wired into `pnpm run build`: packaging is manual, macOS-only, and produces an artifact that is never committed.

The app icon is derived from `website/public/favicon.svg` rather than redrawn, so the whale glyph keeps one home. `build/gen-icon.mjs` measures the path's bounding box headlessly and composes the artwork on Apple's icon grid; `build/make-icns.sh` cuts the `.icns`. Both outputs are committed because electron-builder consumes them and the cutting step needs macOS-only tooling.

## What the packaging step cannot express as configuration

Four behaviours are handled as post-package repairs, recorded here because each one presents as a working build that fails only at runtime:

- electron-builder strips `node_modules` from `extraResources` even with `filter: ["**/*"]`, so the deployed closure is restored by `rsync` after packing.
- The staged manifest declares `"type": "module"`, which breaks a CommonJS Electron entry sharing that directory; the shell is installed as `main.cjs` with a matching `"main"` field.
- `--prepackaged` takes the `.app` bundle, not its parent directory; given a directory it nests the app inside itself.
- Editing `Info.plist` invalidates the code signature, so the bundle is re-signed afterwards.

`stage-manifest.json` is a dependency snapshot, and a naive union of the contributing manifests is wrong: `@deepseek-ai/dsh-session-title-llm` and `@deepseek-ai/dsh-session-telemetry` are reached only as peer dependencies. Omitting them yields a host that boots and silently loses session titling and telemetry.

## Alternatives considered

**Run the harness inside Electron's Node.** This is the conventional Electron layout and removes the bundled runtime and the banner-parsing handshake. Rejected on the `node-pty` ABI: terminal sessions are a core capability, and rebuilding the native module per Electron release ties the harness's supported runtime to Electron's upgrade cadence.

**Make `apps/desktop` a real workspace package.** It would let the build run through `pnpm` like every other target and drop `package.template.json`. Rejected because the packaging root needs a hoisted, production-only closure that is deliberately unlike the development workspace, and adding an Electron toolchain to the lockfile imposes a large dependency on every contributor for a manual, single-platform artifact.

**Fix the port instead of parsing the banner.** Simpler startup, but a fixed port collides with a developer's own `dsh` session and offers no recovery. `--port 0` plus banner parsing is what the host already supports.

**Commit the `.dmg` alongside the source.** Rejected: it is a regenerable ~185 MB binary, and the repository separates the source plane from the artifact plane.

## Consequences

A packaged install is roughly 617 MB on disk and about 185 MB compressed, dominated by the bundled Node runtime and the unpacked dependency closure. `asar` stays off because the closure is consumed by a child process, not by Electron's module loader.

Builds are ad-hoc signed and run only on the machine that produced them. Distribution requires a Developer ID signature and notarization; this note does not cover that work.

The four repairs above are a maintenance liability: each is invisible until the packaged app misbehaves, so they are documented in `apps/desktop/README.md` next to the commands that trigger them. Should electron-builder change any of these behaviours, the repairs must be re-verified rather than assumed still necessary.

Because the build is manual and unreferenced by CI, nothing detects drift between `stage-manifest.json` and the manifests it summarizes. The refresh procedure is written down; it is not enforced.
