# Contributing

Thanks for taking the time to contribute to Githead.

## Development Setup

Prerequisites:

- Node.js with npm
- Vite+ `vp` CLI
- Git available on your `PATH`
- Windows for packaging and full desktop validation

Install dependencies:

```sh
vp install
```

If `vp` is not installed globally yet, run `npm install` once to bootstrap the local Vite+ CLI.
When using the local CLI, prefix commands with `npm exec --`, for example `npm exec -- vp run dev`.

Run the app in development:

```sh
vp run dev
```

## Verification

Run these checks before opening a pull request:

```sh
vp check
vp run typecheck
vp test
vp run build
```

Tests reuse transformed modules between runs. The test build date stays fixed so
the cache remains useful. Development and production builds use the current date.
To investigate a cache issue, bypass it with `vp test --fsModuleCache=false --run`
or clear it with `vp test --clearCache`. Clear the cache after changing transform
plugins if results appear stale.

## Performance comparisons

Run benchmarks separately from tests and builds to avoid CPU contention. These
commands disable the test module cache to keep measurements independent of earlier
test runs. Record a baseline before changing an implementation, then compare the
changed code:

```sh
vp run bench:perf:baseline
# Make the implementation change.
vp run bench:perf:compare
```

The first command saves `artifacts/benchmarks/performance-baseline.json`. The
second prints a comparison for each workload and saves
`artifacts/benchmarks/performance-current.json`. A comparison never replaces the
baseline. Run the baseline command again only when you want a new reference.
Both files are ignored by Git. `vp run bench:perf` still runs without saved data.

Keep the same machine, runtime, and workload definitions for both runs. The
commands reject missing or invalid results, changed benchmark fixtures or
options, and different Node.js, V8, Vitest, OS, CPU model, or architecture values.
Changes to the implementation under test remain comparable. A failed run does
not replace a complete saved result.

The comparison table shows mean latency in milliseconds, the percentage change,
and the relative margin of error for each run. A positive change means slower.
Use the timings and margin of error to assess a change. Repeat a measurement
when the result is close or the machine was busy. These benchmarks have no timing
threshold that passes or fails CI. The saved comparisons use Vitest's
[benchmark result APIs](https://vitest.dev/guide/benchmarking#storing-and-replaying-results).

## Pull Requests

- Keep changes focused and predictable.
- Prefer shared helpers over duplicating logic across files.
- Add or update targeted tests for behavior changes.
- Include user-facing documentation updates when changing setup, release, configuration, security, or data-flow behavior.
