# Obsidian Prism Web task runner (Windows / macOS / Linux)
set shell := ["sh", "-eu", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

python := env("PYTHON", if os_family() == "windows" { "python" } else { "python3" })
crx_key := env("PRISM_CRX_KEY", ".keys/chrome-dev.pem")

# List available recipes
default:
    @just --list

# Validate manifests, CSP, permissions, JS syntax, and notices
check:
    node scripts/check.mjs

# Run deterministic unit tests
test:
    node --test tests/*.test.cjs

# Build unpacked extensions and reproducible ZIP packages
build-zip:
    {{python}} scripts/build.py

# Build Chrome (.zip + .crx) and Firefox (.zip + .xpi) packages
build key=crx_key: build-zip
    node scripts/pack-installers.mjs --key "{{key}}"

# Run local CI: checks, unit tests, packaging, and reproducibility verification
ci key=crx_key: check test
    node scripts/pack-installers.mjs --verify-reproducible --key "{{key}}" --python "{{python}}"

# Run optional Playwright browser fixture tests (requires Playwright installed)
test-browser: build-zip
    npm run test:browser

# Remove built files in dist/ (keeps local signing key)
clean:
    node scripts/pack-installers.mjs --clean
