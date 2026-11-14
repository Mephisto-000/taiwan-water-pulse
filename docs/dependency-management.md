# Dependency management

## Runtime and isolation

This project has two independent manifests and one lock file for each ecosystem:

| Component | Manifest / lock | Isolation |
| --- | --- | --- |
| Python pipeline | `pipeline/pyproject.toml`, `pipeline/uv.lock` | `uv sync --project pipeline` creates the project's own `.venv`; no global Python installation of project dependencies. |
| Web frontend | `web/package.json`, `web/package-lock.json` | `npm --prefix web ci` installs project-local modules; npm is the only Node package manager. |

Observed at initial setup on macOS arm64: Node.js `v24.15.0`, npm `11.12.1`, uv `0.13.8`. Node.js 24 is a supported LTS line already available on the machine. Python `3.14.10` is the supported stable interpreter selected through uv; the OS Python 3.9.6 is not used for the project.

Runtime families are kept consistent with the manifests and version pin files. Lock files are version-controlled. Generated environments, caches and build outputs are ignored. Deleting an environment and restoring from the lock file is supported; deleting or regenerating lock files is not part of a normal install.

## Dependency decisions

The chosen packages serve the purposes below. Resolved versions and licenses were checked against installed package metadata on 2026-11-14; installation paths were measured with commands rather than inferred from conventions.

| Dependency (installed version) | Class | Purpose | License / compatibility decision |
| --- | --- | --- | --- |
| React and react-dom (`19.3.1`) | Production | UI state and accessible declarative controls | MIT; keep matching versions. |
| MapLibre GL JS (`6.18.0`, removed) | Former production dependency | Replaced by a same-origin Canvas radar viewer and SVG coordinate locator | Removed with npm; 25 packages left the installed tree. No new runtime dependency or external map tiles. |
| Vite (`8.3.8`) and @vitejs/plugin-react (`6.3.0`) | Development/build | Local server and optimized static output | MIT; use a release supporting Node 24. |
| TypeScript (`6.0.3`) and @types/react / @types/react-dom (`19.3.0`) | Development | Strict static typing | Apache-2.0 for TypeScript; MIT for DefinitelyTyped declarations. |
| Prettier (`3.8.3`) | Development | Consistent formatting of source and Vite configuration | MIT; build-time tooling only, no runtime bundle impact. |
| Vitest (`5.1.0`) | Development | Pure-function tests | MIT; use a version compatible with the selected Vite/Node versions. |
| NumPy (`2.5.4`) | Production | Array operations for tested numerical primitives and offline diagnostics | Installed license expression: BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0; installed wheel supports Python 3.14. Failed candidate data is not presented as validated radar output. |
| aiohttp (`3.14.5`) | Production | Async HTTP transport for remote access | Apache-2.0 AND MIT; compatible with selected Python. |
| earthaccess (`0.19.0`) | Production | Earthdata authentication and HTTPS sessions | MIT; credentials stay local. |
| fsspec (`2026.9.0`) | Production | File-like HTTP Range reads | BSD-3-Clause; remote-file semantics require real endpoint validation. |
| h5py (`3.16.0`) | Production | Inspect and slice calibrated HDF5 datasets | BSD-3-Clause; use the Python 3.14-compatible wheel. |
| pyproj (`3.8.0`) | Production | Coordinate transforms from actual source projection | MIT; projection must come from file metadata. |
| rasterio (`1.5.2`) | Production | Fixed-grid reprojection and mask rasterization | BSD-3-Clause; native GDAL-backed wheel compatibility is locked. |
| SciPy (`1.18.1`) | Production | Invalid-aware filtering and numerical statistics | BSD-3-Clause plus bundled third-party notices; synthetic tests do not establish real-image accuracy. |
| pytest (`9.2.0`) | Development | Pipeline and seed integrity tests | MIT; isolated in the pipeline environment. |
| Ruff (`0.17.5`) | Development | Python linting | MIT; isolated in the pipeline environment. |

The Python build backend is Hatchling (`1.33.0`, MIT), installed by uv in an isolated build environment when required; it is not a pipeline runtime dependency. Build-system requirements are declared separately in `pyproject.toml` and are not installed in the application environment.

Native SVG supplies the small time-series chart, avoiding another runtime chart library. Earthdata, HDF5 and geospatial packages were added to investigate authenticated file access and a reproducible numerical workflow. Their versions are locked, their native wheels support the selected runtime, and their purpose is isolated to the offline pipeline. Package installation alone does not complete scientific validation or enable the frontend's numerical results.

## Verified installation locations

Run these commands from the repository root to inspect the installed environments:

```bash
node --version
npm --version
uv --version
npm --prefix web root
npm --prefix web ls --depth=0
uv run --project pipeline python -c \
  'import sys, site, numpy; print(sys.version); print(sys.executable); print(site.getsitepackages()); print(numpy.__file__)'
```

Measured outputs from `npm --prefix web root` and `pipeline/.venv/bin/python` inspection:

```text
Node.js: v24.15.0
npm: 11.12.1
uv: 0.13.8
Node modules: web/node_modules
Python: 3.14.10 (Clang 23.1.3)
Python executable: pipeline/.venv/bin/python
Python site-packages: pipeline/.venv/lib/python3.14/site-packages
NumPy module: pipeline/.venv/lib/python3.14/site-packages/numpy/__init__.py
```

Additional installed modules (`aiohttp`, `earthaccess`, `fsspec`, `h5py`, `pyproj`, `rasterio`, `scipy`) were individually resolved with `importlib.util.find_spec`; each resolves to its package `__init__.py` under the measured pipeline site-packages directory above. Node `createRequire(...).resolve("prettier")` resolved `web/node_modules/prettier/index.cjs`.

These measured paths are shown relative to the repository root to avoid publishing a local account name. The commands above print absolute locations in your own checkout. The local environment follows the repository location. `npm ls --depth=0` confirmed the frontend versions in the table; Python's `importlib.metadata.version` confirmed NumPy, pytest and Ruff. The build backend is intentionally absent from the application runtime environment.

## Install and restore

```bash
uv sync --project pipeline --frozen
npm --prefix web ci
```

`uv sync` creates and restores the Python project environment. `npm ci` requires the lock file to match the manifest and replaces local `node_modules` with the locked dependencies. Do not combine npm with yarn or pnpm in this project.

## Start, test and build

```bash
# Published assets are already version-controlled; do not regenerate them to start the UI.
npm --prefix web run dev -- --host 127.0.0.1
uv run --project pipeline pytest pipeline/tests
uv run --project pipeline ruff check pipeline
npm --prefix web test
npm --prefix web run format:check
npm --prefix web run build
npm --prefix web run preview -- --host 127.0.0.1
```

For a repository-subpath deployment and matching local preview, set the same base path for both:

```bash
VITE_BASE_PATH=/taiwan-water-pulse/ npm --prefix web run build
VITE_BASE_PATH=/taiwan-water-pulse/ npm --prefix web run preview
```

Open `http://127.0.0.1:4173/taiwan-water-pulse/` for this subpath preview. A normal default build and preview use `/` without the variable.

Use `npm --prefix web run format` to format source intentionally and `format:check` to verify it without mutation. Run the dev server and preview server as separate interactive commands. Frontend dependencies are needed to build; the static output requires no Node runtime on the host. Python tooling is needed to refresh assets, not to serve the site.

## Add, upgrade and remove

Review the purpose, supported runtime, license, published advisories and API changes before altering a dependency. Keep the smallest direct dependency set that serves the feature.

```bash
# Add a runtime dependency, substituting a reviewed package/version
npm --prefix web install PACKAGE_NAME@VERSION
uv add --project pipeline 'PACKAGE_NAME==VERSION'

# Add a development-only dependency
npm --prefix web install --save-dev PACKAGE_NAME@VERSION
uv add --project pipeline --dev 'PACKAGE_NAME==VERSION'

# Inspect and intentionally update
npm --prefix web outdated
npm --prefix web update
uv lock --project pipeline --upgrade
uv sync --project pipeline --frozen

# Remove
npm --prefix web uninstall PACKAGE_NAME
uv remove --project pipeline PACKAGE_NAME
# For a dev-only Python dependency:
uv remove --project pipeline --dev PACKAGE_NAME
```

Review manifest and lock diffs together. Major upgrades need explicit API and browser compatibility review; the lock upgrade command can select newer compatible releases and is not routine startup. Re-run tests and the production build after changes. Commit both manifests and the corresponding locks.

## Registry and audit verification limits

During this implementation, the official npm registry was unreachable from the execution environment. The available mirror did not support the npm audit endpoint, so a successful vulnerability-advisory audit could not be established. A successful install or integrity check is not an audit result.

The lock file's resolved URLs were normalized to the official npm registry while preserving the same package versions and integrity hashes. A clean restore through the available registry mirror passed. For a normal network environment, restore from the committed lock and run `npm --prefix web audit`; investigate the returned advisory paths before applying changes. Do not claim the dependency tree is free of known vulnerabilities on the basis of the unavailable audit.

## Environment variables

| Variable | Use |
| --- | --- |
| `EARTHDATA_TOKEN` | Optional secret for authenticated GCOV source downloads. Not required to serve the site or rebuild offline from complete local caches. |
| `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD` | Alternative optional Earthdata credentials. Keep both out of source, logs and static assets. |
| `VITE_BASE_PATH` | Public build-time path, e.g. `/taiwan-water-pulse/`; configure for the host. Never put secrets in `VITE_*`, which are public frontend configuration. |

The pipeline reads exported environment variables and does not implicitly load `.env`. `.env.example` contains names and empty credential fields only. If using a local `.env`, export it intentionally in a trusted shell; never commit it or include it in screenshots. The `read` command accepts exported Earthdata credentials or an explicit `--credentials-file` pointing to a local ignored file. It never implicitly loads a credential file. Successful authentication permits source reads, not publication: `measure` and `export --numeric` return a nonzero status for the recorded failed held-out tests and keep the archive in browse mode.

## Common problems

- **OS Python is too old:** run through `uv` and the pinned Python family, not the macOS system interpreter. Let uv select/download the compatible runtime if needed.
- **Frozen install reports a lock mismatch:** review the manifest change and intentionally refresh the relevant lock; do not bypass reproducibility by deleting it.
- **Sandbox cannot write uv cache:** set `UV_CACHE_DIR` to a writable local cache directory for that invocation; this affects the tool cache, not the project environment.
- **Network or authentication failure:** distinguish DNS/connection errors, HTTP access errors and missing credentials. Offline exports use tracked snapshots; failed downloads remain unavailable.
- **Blank page under a repository URL:** rebuild with the correct base path and publish `web/dist`, not the source tree.
- **Missing browse PNG:** rerun the public refresh when the source is reachable. Do not replace it with an unrelated or generated picture.
- **Locator:** The current SVG locator does not require WebGL or external tiles.
- **Stale generated files:** rebuild the current calibrated archive with `uv run --project pipeline water-pulse release --offline` after obtaining the required AOI caches; confirm provenance before committing outputs. `all --offline` builds the historical Browse fallback instead.
- **Security audit findings:** inspect dependency paths and advisories, apply a compatible fix and run verification. Do not use an unreviewed force upgrade merely to clear a report.

## Vercel deployment (2026-11-14)

The original SI disclosure update added no dependencies. `si-usage.json` is repository metadata; the pipeline copies it into `web/public/data/` and labels generated JSON. For the current calibrated release, rebuild with `uv run --project pipeline water-pulse release --offline`, then run the Python/frontend tests and build commands below. The older `export --offline` command reproduces the Browse fallback, not this release. Runtime, package-manager versions and measured installation locations remain as recorded above.

`web/package.json` pins `engines.node` to `24.x`; `.nvmrc` pins local Node to `24.15.0`. npm remains `11.12.1`. No package was added or upgraded for deployment. `check:deploy` and its tests use Node built-ins. `npm ci` uses the existing `web/package-lock.json`; modules were rechecked at `web/node_modules` with `npm --prefix web root`. Python paths above were rechecked with the actual project interpreter.

```bash
npm --prefix web ci
npm --prefix web run test:deploy
npm --prefix web test
npm --prefix web run build
npm --prefix web run check:deploy
```

Vercel needs no Earthdata or application environment variables. The initial deployment uploads only checked `web/dist` files through the authenticated Vercel plugin. No Vercel CLI was installed, no token was created, and no CLI dependency was added to either lock file. See [deployment](deployment.md) for the exact delivery mode and Git integration status.

## Review improvements and calibrated release (2026-11-14)

Removed `maplibre-gl` using `npm --prefix web uninstall maplibre-gl --ignore-scripts --offline`. The lock file and installed tree now contain only React/react-dom as direct runtime dependencies; 25 packages were removed, with no version upgrades. The current radar viewer uses Canvas and SVG, and the locator needs no map tiles. Scientific diagnostics use the existing NumPy/rasterio/SciPy environment; quickview annotations use macOS system Swift/AppKit, not a new project package. This renderer is optional and platform-specific.

`npm --prefix web root` and `npm --prefix web ls --depth=0` were rerun after removal. The measured install location remains `web/node_modules`; the project Python executable, NumPy module and site-packages locations were also rechecked and match the relative paths above. The offline npm removal printed an audit summary, but it is not evidence of a fresh online advisory review.

```bash
# Restore the updated dependency trees
npm --prefix web ci
uv sync --project pipeline --frozen

# Current calibrated release: requires existing ignored AOI caches
uv run --project pipeline water-pulse release --offline

# Get missing source windows with locally configured Earthdata credentials
uv run --project pipeline water-pulse read \
  --reservoirs baoshan2,liyutan,shimen,feitsui
```

`release --offline` replaces the public archive with the current calibrated release. The historical `all --offline` / `export --offline` commands instead produce the Browse fallback and are not the current release-reproduction command. Starting or building the frontend needs neither raw caches nor Earthdata credentials.

The test suite checks real exported analysis grids against the browser's area calculations. Node filesystem integration tests are `.test.mjs` files, executed by the existing Vitest installation; no extra Node type package was added. Frontend and Python lock files remain the single locks for their ecosystems.
