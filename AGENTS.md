# AGENTS.md — deploying this example

A canonical, copy-pasteable contract for an automated agent deploying
`thebes-example-university` to a Thebes cluster. Human-readable detail is in
[README.md](README.md).

## Layout

```
thebes.toml                 deploy manifest (network + canisters)
motoko/main.mo              backend (Motoko); imports mo:thebes-lib/Admin
motoko/thebes-lib/          vendored backend library (local Mops dep — no external pin)
frontend/                   React + Vite app on @thebes/sdk
frontend/vendor/@thebes/sdk vendored SDK (local file: dep — no external pin)
```

## Toolchain (exact)

- Motoko compiler **1.4.1**, fetched by `mops install` to
  `~/.cache/mops/moc/1.4.1/moc` (macOS: `~/Library/Caches/mops/moc/1.4.1/moc`).
  Do **not** invoke a bare `moc` — a default `PATH` may resolve a different
  compiler version or Qt's Meta-Object Compiler.
- Node 18+, Mops, and the `thebes-deploy` CLI (Linux x86-64 prebuilt; build from
  the release source bundle on other platforms).
- `mops install` prints `core@2.5.0 requires moc >= 1.6.0` while 1.4.1 is pinned.
  This is expected — the cluster pins 1.4.1 and the build succeeds.

## Deploy

```sh
# 0. network: the validators in thebes.toml [networks.wan] are the current WAN
#    cluster endpoints. To confirm them:
thebes-deploy init            # prints current WAN cluster validators

# 1. backend
thebes-deploy identity new me
thebes-deploy deploy university   # → prints the backend cid (call it UNIVERSITY_CID)

# 2. frontend
curl -L -o asset_canister.wasm \
  https://github.com/Mercatura-Forum/Thebes-Protocol-/releases/download/asset-canister-v0.1.0/asset_canister.wasm
cd frontend && npm install && npm run build && cd ..
sed -i 's#<head>#<head><script>window.UNIVERSITY_CID=UNIVERSITY_CID;</script>#' frontend/dist/index.html
thebes-deploy deploy web      # → prints https://memphis.mercaturaforum.com/_/raw/<cid>/index.html
```

Verify: `curl -s -o /dev/null -w '%{http_code}' <printed-url>` returns `200`.

## Calling the backend

```sh
thebes-deploy query university coursesView         # queries need no identity
thebes-deploy call  university seedDemo            # updates need a local identity
```

Public methods (see `motoko/main.mo`):

| Method | Kind | Notes |
| --- | --- | --- |
| `coursesView` | query | The full catalog (flat records). |
| `myCoursesView` | query | The caller's enrolled courses. |
| `isRegistrationOpen` / `isPaused` / `getOwner` | query | Status surface. |
| `seedDemo` | update | Populate demo courses (admin). |
| `addCourse` / `setCoursePhoto` / `setRegistrationOpen` | update | Registrar surface (admin). |
| `enroll` / `drop` | update | Student actions; trap on a failed guard. |
| `claimOwner` / `transferOwner` / `addAdmin` / `setPaused` | update | Ownership + admin (from `thebes-lib`'s `Admin`). |

Candid arguments use textual form, passed with `--arg`, e.g.:

```sh
thebes-deploy call university addCourse \
  --arg '("CS101", "Intro to Computing", 30 : nat, "Dr. Hale", null)'
thebes-deploy call university enroll --arg '(0 : nat)'
thebes-deploy call university setRegistrationOpen --arg '(true)'
```

## Conventions that affect correctness

- **`window.UNIVERSITY_CID`** (and optional `window.MEDIA_CID`) are injected into
  the built page at deploy time; the frontend reads them at runtime. If you skip the
  injection step, the page falls back to compiled-in defaults and talks to the
  wrong backend.
- **Guarded writes trap.** `enroll`, `drop`, and the registrar methods call
  `Runtime.trap` (and `Admin.requireNotPaused`) on a failed guard, so the client
  sees a rejection instead of a silently-swallowed error.
- **Boundary decoding** returns a `vec record` of scalar fields. A single record is
  a 0-or-1-element array; principal fields are 56-character hex. Decode with the
  SDK's `decodeVecRecord` / `decodeNat` / `decodeBool`.
