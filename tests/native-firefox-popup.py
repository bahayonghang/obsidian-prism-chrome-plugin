#!/usr/bin/env python3
"""Test a native Firefox action popup with an isolated, test-only background harness.

Run under a dedicated Xvfb display. Requires selenium==4.53.0, geckodriver
0.37.1, Firefox >= 149. Published files are copied and hash-checked; only the
temporary manifest receives an additional test background script. Firefox 153
WebDriver navigation restrictions remain enabled. WebDriver launches Firefox
and installs the temporary add-on; it never navigates to or evaluates scripts
in privileged pages. The extension reports synthetic measurements through
ordinary CORS fetch to a token-protected loopback HTTP server, without adding
or requesting extension permissions. No action-popup viewport is assigned.
"""

import argparse
from copy import deepcopy
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import threading
import traceback

from selenium import webdriver
from selenium.webdriver.firefox.service import Service


HARNESS_PATH = "__prism_native_test__/harness.js"
MAX_REPORT_BYTES = 128 * 1024


def require(condition, message, detail=None):
    if not condition:
        raise AssertionError(message + (f": {json.dumps(detail, ensure_ascii=False)}" if detail is not None else ""))


def file_hashes(directory):
    return {str(path.relative_to(directory)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(directory.rglob("*")) if path.is_file()}


def stage_extension(source, target, report_url, report):
    original = file_hashes(source)
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    require(HARNESS_PATH not in original, "Published artifact unexpectedly contains the test harness")
    require(isinstance(manifest.get("background", {}).get("scripts"), list),
            "Expected the Firefox artifact's background.scripts manifest")
    shutil.copytree(source, target)
    staged_manifest = deepcopy(manifest)
    staged_manifest["background"]["scripts"].append(HARNESS_PATH)
    (target / "manifest.json").write_text(json.dumps(staged_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    harness_source = Path(__file__).with_name("firefox-popup-harness.js").read_text(encoding="utf-8")
    config = {"reportUrl": report_url, "extensionId": report["extensionId"], "version": report["version"]}
    harness = target / HARNESS_PATH
    harness.parent.mkdir()
    harness.write_text("globalThis.PRISM_NATIVE_TEST = Object.freeze(" + json.dumps(config) + ");\n" + harness_source,
                       encoding="utf-8")
    staged = file_hashes(target)
    require(set(staged) == set(original) | {HARNESS_PATH}, "Unexpected files in test-only staging")
    for path, digest in original.items():
        if path != "manifest.json":
            require(staged[path] == digest, f"Published file changed in test staging: {path}")
    restored_manifest = deepcopy(staged_manifest)
    require(restored_manifest["background"]["scripts"].pop() == HARNESS_PATH, "Missing test background script")
    require(restored_manifest == manifest, "Test staging changed another manifest field")
    report["testStaging"] = {
        "mode": "installed-addon-with-test-only-background-harness",
        "manifestChange": f"Append {HARNESS_PATH} to background.scripts only",
        "publishedFilesVerified": len(original) - 1,
        "permissionsChanged": False,
        "publishedFileSha256": original,
        "testHarnessSha256": staged[HARNESS_PATH],
    }
    return original


def capture_desktop(artifacts, name, report):
    capture = shutil.which("import")
    if not capture:
        note = "ImageMagick import unavailable; no native desktop screenshot captured."
        if note not in report.setdefault("screenshotNotes", []):
            report["screenshotNotes"].append(note)
        return
    try:
        subprocess.run([capture, "-window", "root", str(artifacts / f"{name}.png")],
                       check=True, timeout=10, capture_output=True)
    except (subprocess.SubprocessError, OSError) as error:
        report.setdefault("screenshotNotes", []).append(f"Desktop capture failed: {error}")


def make_reporter(artifacts, report):
    ready, done = threading.Event(), threading.Event()
    lock = threading.Lock()
    route = "/" + secrets.token_urlsafe(32)

    class Reporter(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def reply(self, status, data):
            body = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.reply(200 if self.path in (route, route + "/ready") else 404, {})

        def do_GET(self):
            if self.path != route + "/ready":
                self.reply(404, {"error": "Unknown route"})
                return
            self.reply(200, {"ready": ready.is_set()})

        def do_POST(self):
            if self.path != route:
                self.reply(404, {"error": "Unknown route"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_REPORT_BYTES:
                    self.reply(413, {"error": "Invalid report size"})
                    return
                message = json.loads(self.rfile.read(length))
                if (not isinstance(message, dict) or message.get("kind") not in ("stage", "result") or
                        not isinstance(message.get("stage"), str) or not isinstance(message.get("data"), dict)):
                    self.reply(400, {"error": "Invalid report"})
                    return
                with lock:
                    if done.is_set():
                        self.reply(409, {"error": "Run already finished"})
                        return
                    report["stage"] = message["stage"]
                    report.setdefault("events", []).append(message)
                    print("Firefox native harness: " + message["stage"], flush=True)
                    # The extension awaits this response, so its popup remains
                    # open throughout the desktop capture; no timing sleep.
                    captures = {
                        "initial": "native-firefox-popup-appearance",
                        "motion": "native-firefox-popup-motion",
                        "reopened": "native-firefox-popup-reopened",
                        "failed": "native-firefox-failure",
                    }
                    if message["stage"] in captures:
                        capture_desktop(artifacts, captures[message["stage"]], report)
                    if message["kind"] == "result":
                        report["harness"] = message["data"]
                        report["status"] = "passed" if message["data"].get("status") == "passed" else "failed"
                    (artifacts / "native-firefox-popup.json").write_text(
                        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
                    self.reply(200, {"ok": True})
                    if message["kind"] == "result":
                        done.set()
            except (ValueError, UnicodeError) as error:
                self.reply(400, {"error": str(error)})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Reporter)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, ready, done, f"http://127.0.0.1:{server.server_port}{route}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extension-dir", type=Path, default=Path("dist/firefox"))
    parser.add_argument("--artifact-dir", type=Path, default=Path("test-artifacts/native-firefox"))
    parser.add_argument("--firefox-binary", default=os.environ.get("FIREFOX_BINARY"), required=not os.environ.get("FIREFOX_BINARY"))
    parser.add_argument("--geckodriver", default=os.environ.get("GECKODRIVER") or shutil.which("geckodriver"))
    args = parser.parse_args()
    require(bool(os.environ.get("DISPLAY")), "Run this headed test under a dedicated xvfb-run display")
    require(args.geckodriver is not None, "Install pinned geckodriver and pass --geckodriver")
    extension = args.extension_dir.resolve()
    manifest_bytes = (extension / "manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    addon_id = manifest["browser_specific_settings"]["gecko"]["id"]
    artifacts = args.artifact_dir.resolve()
    artifacts.mkdir(parents=True, exist_ok=True)
    report = {"status": "running", "extensionId": addon_id, "version": manifest["version"],
              "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest()}
    driver, server, original_hashes = None, None, None
    try:
        server, ready, done, report_url = make_reporter(artifacts, report)
        with tempfile.TemporaryDirectory(prefix="prism-firefox-native-test-") as temporary:
            staged = Path(temporary) / "addon"
            original_hashes = stage_extension(extension, staged, report_url, report)
            options = webdriver.FirefoxOptions()
            options.binary_location = str(Path(args.firefox_binary).resolve())
            # geckodriver creates a fresh disposable profile. No system access,
            # permission grants, UUID overrides, or protection bypasses.
            for name, value in {
                "app.update.auto": False,
                "app.update.enabled": False,
                "app.update.service.enabled": False,
                "extensions.update.enabled": False,
                "extensions.systemAddon.update.enabled": False,
                "datareporting.healthreport.uploadEnabled": False,
                "datareporting.policy.dataSubmissionEnabled": False,
                "toolkit.telemetry.enabled": False,
                "toolkit.telemetry.unified": False,
                "toolkit.telemetry.archive.enabled": False,
                "browser.newtabpage.enabled": False,
                "browser.startup.page": 0,
                "browser.startup.homepage": "about:blank",
                "browser.shell.checkDefaultBrowser": False,
            }.items():
                options.set_preference(name, value)
            service = Service(executable_path=args.geckodriver, log_output=str(artifacts / "geckodriver.log"))
            print("Launching isolated Firefox with a verified test-only background harness", flush=True)
            driver = webdriver.Firefox(options=options, service=service)
            # Size the containing browser window only. The action popup chooses
            # its own dimensions; neither Python nor the harness overrides them.
            driver.set_window_rect(x=0, y=0, width=1280, height=1000)
            report["firefoxVersion"] = driver.capabilities["browserVersion"]
            report["geckodriverVersion"] = driver.capabilities.get("moz:geckodriverVersion")
            require(int(report["firefoxVersion"].split(".")[0]) >= 149,
                    "Firefox 149+ is required for public action.openPopup without a user gesture")
            report["stage"] = "temporary-install"
            require(driver.install_addon(str(staged), temporary=True) == addon_id, "Unexpected installed add-on ID")
            ready.set()
            print("Installed test fixture; waiting for extension-owned native-popup measurements", flush=True)
            require(done.wait(120), "Native Firefox harness did not report a result within 120 seconds", report.get("stage"))
            require(report["status"] == "passed", "Native Firefox popup checks failed", report.get("harness"))
            require(file_hashes(extension) == original_hashes, "Published Firefox artifact changed during the smoke test")
            report["publishedArtifactUnchanged"] = True
            print("PASS: native Firefox popup size, visible controls, saving, and reopening (test-only harness)", flush=True)
            driver.quit()
            driver = None
    except Exception as error:
        report["status"] = "failed"
        report["error"] = {"type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
        if driver:
            capture_desktop(artifacts, "native-firefox-failure", report)
        raise
    finally:
        if original_hashes is not None:
            report["publishedArtifactUnchanged"] = file_hashes(extension) == original_hashes
        (artifacts / "native-firefox-popup.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if driver:
            driver.quit()
        if server:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
