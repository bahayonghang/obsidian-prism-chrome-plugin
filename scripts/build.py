#!/usr/bin/env python3
"""Reproducible, dependency-free browser packages. Modified 2026-11-22; GPL-3.0-only."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import struct
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
FIXED_TIME = (2026, 11, 21, 0, 0, 0)
# Explicit allowlist: never discover and bundle the developer's working directory.
FILES = (
    "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "README.md", "PRIVACY.md", "MODIFICATIONS.md",
    "docs/ARCHITECTURE.md", "docs/TESTING.md", "docs/IMPLEMENTATION_PLAN.md", "docs/UX_REFRESH_PLAN.md", "docs/REGRESSION_FIX_PLAN.md",
    "icons/icon.svg", "icons/icon-16.png", "icons/icon-48.png", "icons/icon-128.png",
    "styles/prism-tokens.css", "styles/hosts.css",
    "src/config-schema.js", "src/early-boot.js", "src/adapters.js", "src/content.js", "src/background.js",
    "popup/popup.html", "popup/popup.css", "popup/popup.js",
)
HOSTS = ["https://chatgpt.com/*", "https://chat.openai.com/*", "https://gemini.google.com/*"]
OPTIONAL_HOSTS = ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_regular(relative: str) -> bytes:
    path = ROOT / relative
    require(path.is_file() and not path.is_symlink(), f"Missing or symlinked package input: {relative}")
    require(path.resolve().is_relative_to(ROOT), f"Package input outside repository: {relative}")
    return path.read_bytes()


def validate_manifest(manifest: dict, browser: str, version: str) -> None:
    require(manifest.get("manifest_version") == 3, f"{browser}: Manifest V3 required")
    require(manifest.get("version") == version, f"{browser}: version must match package.json")
    require(manifest.get("permissions") == ["storage"], f"{browser}: unexpected mandatory permissions")
    require(manifest.get("host_permissions") == HOSTS, f"{browser}: unexpected default hosts")
    require(manifest.get("optional_host_permissions") == OPTIONAL_HOSTS, f"{browser}: unexpected optional hosts")
    require(len(manifest.get("content_scripts", [])) == 2, f"{browser}: unexpected content script groups")
    references = [manifest["action"]["default_popup"], manifest["options_ui"]["page"].split("?")[0]]
    for script in manifest["content_scripts"]:
        require(script.get("matches") == HOSTS and script.get("all_frames") is False, f"{browser}: injection scope changed")
        references.extend(script.get("js", []) + script.get("css", []))
    references.extend(manifest["icons"].values())
    if browser == "chrome":
        require(manifest.get("background") == {"service_worker": "src/background.js"}, "Chrome needs its service worker")
        require(manifest.get("minimum_chrome_version") == "111", "Unexpected Chrome minimum version")
        references.append(manifest["background"]["service_worker"])
    else:
        require(manifest.get("background") == {"scripts": ["src/config-schema.js", "src/background.js"]}, "Firefox needs event-page scripts")
        gecko = manifest["browser_specific_settings"]["gecko"]
        require(gecko.get("strict_min_version") == "140.0", "Unexpected Firefox minimum version")
        require(gecko.get("data_collection_permissions") == {"required": ["none"], "optional": ["websiteContent", "personalCommunications", "authenticationInfo"]}, "Firefox data declaration missing")
        references.extend(manifest["background"]["scripts"])
    for path in references:
        require(path in FILES, f"{browser}: undeclared package resource {path}")


def main() -> None:
    version = json.loads(read_regular("package.json"))["version"]
    payload = {path: read_regular(path) for path in FILES}
    for size in (16, 48, 128):
        png = payload[f"icons/icon-{size}.png"]
        require(png.startswith(b"\x89PNG\r\n\x1a\n") and struct.unpack(">II", png[16:24]) == (size, size), f"Invalid {size}px icon")
    manifests = {}
    for browser, path in (("chrome", "manifest.json"), ("firefox", "manifests/firefox.json")):
        manifest = json.loads(read_regular(path))
        validate_manifest(manifest, browser, version)
        manifests[browser] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    require(not DIST.is_symlink(), f"Refusing symlinked output directory: {DIST}")
    DIST.mkdir(exist_ok=True)
    checksums = []
    for browser in ("chrome", "firefox"):
        target = DIST / browser
        require(not target.is_symlink(), f"Refusing to overwrite symlink: {target}")
        if target.exists():
            shutil.rmtree(target)
        target.mkdir()
        files = {**payload, "manifest.json": manifests[browser]}
        archive = DIST / f"obsidian-prism-web-{version}-{browser}.zip"
        require(not archive.is_symlink(), f"Refusing to overwrite symlink: {archive}")
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
            for name, data in sorted(files.items()):
                path = target / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                info = zipfile.ZipInfo(name, FIXED_TIME)
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                output.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        with zipfile.ZipFile(archive) as check:
            require(check.testzip() is None, f"Archive integrity failed: {archive.name}")
            require(check.namelist() == sorted(files), "Unexpected archive entries")
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        checksums.append(f"{digest}  {archive.name}\n")
        print(f"Built {archive.relative_to(ROOT)} ({archive.stat().st_size:,} bytes; {len(files)} files)")
    checksum_file = DIST / "SHA256SUMS"
    require(not checksum_file.is_symlink(), f"Refusing to overwrite symlink: {checksum_file}")
    with checksum_file.open("w", encoding="utf-8", newline="\n") as output:
        output.write("".join(checksums))
    print("Wrote dist/SHA256SUMS; unpacked builds: dist/chrome and dist/firefox")


if __name__ == "__main__":
    main()
