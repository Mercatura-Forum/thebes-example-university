# thebes-example-university

Quad — an on-chain registrar built on
[Thebes Protocol](https://github.com/Mercatura-Forum/Thebes-Protocol-): a Motoko
backend that holds the course catalog (with prerequisites and credits),
per-student enrollments, waitlists and append-only transcripts, and a React
frontend served as certified assets.

The property this example proves: **a registration that cannot contradict
itself.** A seat never oversells (every guard and the seat increment share one
synchronous call); a student never double-enrolls, never exceeds the 18-credit
load, and never enters a course whose prerequisites they have not completed —
the catalog is a DAG by construction, since a course can only require courses
that already exist. Full courses queue a FIFO waitlist that promotes
first-come-first-eligible when a seat frees. Grades are recorded once by the
registrar onto an append-only transcript; GPA is computed on-chain,
credit-weighted. A **public oracle** (`invariantReportView`) re-proves five
laws over the whole university on every read.

Live demo: <https://memphis.mercaturaforum.com/_/raw/191581724526353/index.html>

## Architecture

```
frontend (React + Vite + Tailwind)   →   university backend (Motoko)
   @thebes/sdk  ── boundary client       mo:thebes-lib ── Admin
   Memphis passkey gate                  catalog · enrollments · registrar
```

- **frontend/** uses `@thebes/sdk` for the boundary client, typed query/update
  calls, React hooks, and the Memphis passkey gate. The SDK is **vendored** under
  `frontend/vendor/@thebes/sdk` and resolved as a local dependency
  (upstream source of truth: [`thebes-sdk`](https://github.com/Mercatura-Forum/thebes-sdk)).
- **motoko/** uses `thebes-lib` for `Admin` (controller-gated operations); the
  registration logic lives in `main.mo`. The library is **vendored** under
  `motoko/thebes-lib` and resolved as a local Mops dependency.

Both halves are self-contained: the repository builds with no external Git or Mops
toolkit pins. The frontend asset-canister wasm is the one artifact fetched at
deploy time (see [Deploy](#deploy)).

## Backend interface (selected)

| Method | Kind | Purpose |
| --- | --- | --- |
| `catalogView` | query | The catalog with the caller's per-course state (completed / enrolled / waitlisted / open / locked-with-reason / full) — the degree constellation draws from it. |
| `enroll` / `drop` | update | Student actions; every guard (seats, double-enroll, prerequisites, credit load, window) traps with its reason, and the seat count updates atomically. |
| `joinWaitlist` / `leaveWaitlist` | update | Queue for a full course; promotion is first-come-first-eligible on any freed seat. |
| `myStandingView` / `myTranscriptView` | query | Credits in progress and completed, on-chain credit-weighted GPA, and the append-only transcript. |
| `recordGrade` / `transferCredit` | update | Registrar grading (frees the seat and promotes the waitlist in the same step) and prior-work credit. |
| `addCourse` / `setCoursePhoto` / `setRegistrationOpen` | update | Registrar catalog management; prerequisites must already exist. |
| `rollView` | query | Registrar: one course's roll with each student's credit load. |
| `invariantReportView` / `universitySealView` | query | The public five-law oracle and the every-roll-reconciles seal. |
| `claimOwner` / `transferOwner` / `addAdmin` / `setPaused` | update | Ownership and admin surface (from `thebes-lib`'s `Admin`). |

## Toolchain

- **Motoko compiler 1.4.1.** `mops install` fetches the pinned compiler to
  `~/.cache/mops/moc/1.4.1/moc` (macOS: `~/Library/Caches/mops/moc/1.4.1/moc`).
  Use that binary — the `moc` on a default `PATH` may be a different version, or
  Qt's unrelated Meta-Object Compiler.
- **Node 18+** and **[Mops](https://mops.one)** for the two builds.
- **[`thebes-deploy`](https://github.com/Mercatura-Forum/Thebes-Protocol-/releases)**
  to deploy. The prebuilt binary is Linux x86-64; on other platforms build it from
  the release source bundle (`cargo build --release -p thebes-deploy`).

## Run locally

```sh
# Frontend
cd frontend
npm install            # resolves the vendored @thebes/sdk
npm run dev            # sync-sdk copies the browser runtimes into public/, then Vite serves

# Backend (compile-check)
cd ../motoko
mops install           # resolves the vendored thebes-lib + the pinned compiler
"$(ls "$HOME/.cache/mops/moc/1.4.1/moc" "$HOME/Library/Caches/mops/moc/1.4.1/moc" 2>/dev/null | head -1)" --check $(mops sources) main.mo
```

## Deploy

`thebes.toml` describes the deploy. The `validators` in `[networks.wan]` are the
current WAN cluster endpoints — run `thebes-deploy init` to print them if you need
to confirm the live set.

> **Deploying your own copy?** The committed `cid` values pin the **live catalog
> deployment** (that's what the demo links serve — only its controller can
> upgrade it). Before your first deploy, set `cid = "auto"` on each canister:
> the deploy allocates fresh canisters you control and writes their ids back
> into the manifest.

### 1. Backend

```sh
thebes-deploy identity new me      # one-time local signing identity
thebes-deploy deploy university    # build + install + verify → prints the backend cid
```

### 2. Frontend

The frontend installs an asset canister, then uploads your built bundle. Fetch the
asset-canister wasm once (it is referenced by `thebes.toml` as `asset_canister.wasm`):

```sh
curl -L -o asset_canister.wasm \
  https://github.com/Mercatura-Forum/Thebes-Protocol-/releases/download/asset-canister-v0.1.0/asset_canister.wasm
```

Build the bundle and point it at your backend cid (the frontend reads
`window.UNIVERSITY_CID` at runtime), then deploy:

```sh
cd frontend && npm run build && cd ..
# inject the backend cid from step 1 into the built page:
sed -i 's#<head>#<head><script>window.UNIVERSITY_CID=YOUR_UNIVERSITY_CID;</script>#' frontend/dist/index.html
thebes-deploy deploy web           # install asset canister + upload bundle + verify
```

The deploy prints the live URL:
`https://memphis.mercaturaforum.com/_/raw/<web-cid>/index.html`.

> Course photos are served by a separate media canister via `window.MEDIA_CID`.
> It is optional — without one, courses render without images.

For a machine-readable deploy contract, see [AGENTS.md](AGENTS.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
