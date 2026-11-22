#!/usr/bin/env python3
"""Smoke-test an installed Firefox action popup, without privileged UI access.

Run in a fresh Xvfb display; never point this test at a personal browser profile.
Dependencies: selenium==4.53.0, geckodriver 0.37.1, Firefox >= 149.
The extension directory is installed unchanged. No popup viewport is assigned.
Only public WebExtension APIs and the visible about:debugging Manifest URL are
used. Optional ImageMagick `import` captures the actual Xvfb desktop, since a
WebDriver tab screenshot does not establish that a native popup is visible.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import traceback
from urllib.parse import urlsplit

from selenium import webdriver
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.support.ui import WebDriverWait


# Find the link displayed beside this add-on's ID, not a guessed/preset UUID or
# a Firefox preference/internal WebExtensionPolicy. Ancestor matching avoids
# depending on localized labels or private React state in about:debugging.
MANIFEST_LINK = r"""
const id = arguments[0];
const links = [...document.querySelectorAll('a[href]')].filter(link => {
  try {
    const url = new URL(link.href);
    return url.protocol === 'moz-extension:' && url.pathname === '/manifest.json';
  } catch (_) { return false; }
});
return [...new Set(links.filter(link => {
  for (let parent = link.parentElement; parent; parent = parent.parentElement) {
    if (parent.textContent.includes(id) &&
        links.filter(candidate => parent.contains(candidate)).length === 1) return true;
  }
  return false;
}).map(link => link.href))];
"""

POPUP_SNAPSHOT = r"""
const views = browser.extension.getViews({type: 'popup'});
if (views.length !== 1) return {count: views.length, ready: false};
const win = views[0], doc = win.document;
if (!doc.body) return {count: 1, ready: false};
function box(selector) {
  const node = doc.querySelector(selector);
  if (!node) return null;
  const rect = node.getBoundingClientRect(), css = win.getComputedStyle(node);
  let left = 0, top = 0, right = win.innerWidth, bottom = win.innerHeight;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const style = win.getComputedStyle(parent), bounds = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
    }
  }
  return {x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    visible: rect.width > 0 && rect.height > 0 && css.display !== 'none' &&
      css.visibility === 'visible' && Number(css.opacity) > 0 &&
      rect.left >= left - 1 && rect.right <= right + 1 &&
      rect.top >= top - 1 && rect.bottom <= bottom + 1};
}
const fields = doc.getElementById('settings-fields');
const status = doc.getElementById('status-msg');
return {
  count: 1, ready: doc.readyState === 'complete' && fields && !fields.disabled,
  width: win.innerWidth, height: win.innerHeight, timeOrigin: win.performance.timeOrigin,
  bodyWidth: doc.body.getBoundingClientRect().width,
  bodyHeight: doc.body.getBoundingClientRect().height,
  scrollWidth: doc.documentElement.scrollWidth,
  activeTab: doc.body.dataset.activeTab, optionsMode: doc.body.classList.contains('is-options-page'),
  visible: !doc.hidden, saveStatus: status?.textContent, saveError: status?.dataset.error,
  ambientStyle: doc.getElementById('cfg-ambientStyle')?.value,
  ambientIntensity: doc.getElementById('cfg-ambientIntensity')?.value,
  spotlightPressed: doc.querySelector('[data-choice="ambientStyle"][data-value="spotlight"]')?.getAttribute('aria-pressed'),
  previewStyle: doc.getElementById('chat-preview')?.dataset.ambient,
  boxes: Object.fromEntries(['header.brand', 'nav.tabs', '#settings-scroll', 'footer',
    '#cfg-enabled', '#tab-motion', '#cfg-ambientStyle', '#cfg-ambientIntensity',
    '[data-choice="ambientStyle"][data-value="spotlight"]'].map(s => [s, box(s)]))
};
"""


def require(condition, message, detail=None):
    if not condition:
        raise AssertionError(message + (f": {json.dumps(detail, ensure_ascii=False)}" if detail is not None else ""))


def call_async(driver, source):
    result = driver.execute_async_script(
        "const done = arguments[arguments.length - 1];"
        "(async () => {" + source + "})().then("
        "value => done({ok: true, value}), error => done({ok: false, error: String(error), stack: error.stack}));"
    )
    require(result.get("ok"), "Extension API call failed", result)
    return result.get("value")


def snapshot(driver):
    return driver.execute_script(POPUP_SNAPSHOT)


def wait_popup(driver):
    return WebDriverWait(driver, 20, poll_frequency=0.15).until(
        lambda current: (state if (state := snapshot(current)).get("ready") else False),
        "The installed action popup did not become ready",
    )


def check_layout(state, motion=False):
    require(state["count"] == 1 and state["visible"] and not state["optionsMode"],
            "Expected a visible native action popup", state)
    require(438 <= state["width"] <= 442 and 598 <= state["height"] <= 602,
            "Native action popup did not acquire its natural 440 x 600 size", state)
    require(state["scrollWidth"] <= state["width"] + 1, "Popup has horizontal overflow", state)
    selectors = ["header.brand", "nav.tabs", "#settings-scroll", "footer", "#cfg-enabled", "#tab-motion"]
    if motion:
        selectors += ["#cfg-ambientStyle", "#cfg-ambientIntensity",
                      '[data-choice="ambientStyle"][data-value="spotlight"]']
    for selector in selectors:
        require(state["boxes"][selector] and state["boxes"][selector]["visible"],
                f"Popup control is clipped or missing: {selector}", state)
    require(state["saveError"] != "true" and bool(state["saveStatus"]),
            "Popup did not finish loading settings successfully", state)


def capture_desktop(artifacts, name, report):
    capture = shutil.which("import")
    if not capture:
        report.setdefault("screenshotNotes", []).append("ImageMagick import unavailable; DOM measurements remain authoritative.")
        return
    try:
        subprocess.run([capture, "-window", "root", str(artifacts / f"{name}.png")],
                       check=True, timeout=10, capture_output=True)
    except (subprocess.SubprocessError, OSError) as error:
        report.setdefault("screenshotNotes", []).append(f"Desktop capture failed: {error}")


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
              "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(), "steps": {}}
    driver = None
    try:
        options = webdriver.FirefoxOptions()
        options.binary_location = str(Path(args.firefox_binary).resolve())
        # geckodriver creates a disposable profile. Do not use a user's profile,
        # --allow-system-access, signature bypasses, or additional add-on grants.
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
        print("Launching isolated headed Firefox; popup size will be chosen by Firefox", flush=True)
        driver = webdriver.Firefox(options=options, service=service)
        driver.set_page_load_timeout(30)
        driver.set_script_timeout(25)
        # This is the containing browser window, not the action popup viewport.
        driver.set_window_rect(x=0, y=0, width=1280, height=1000)
        report["firefoxVersion"] = driver.capabilities["browserVersion"]
        report["geckodriverVersion"] = driver.capabilities.get("moz:geckodriverVersion")
        require(int(report["firefoxVersion"].split(".")[0]) >= 149,
                "Firefox 149+ is needed for public action.openPopup without a user gesture")
        report["stage"] = "temporary-install"
        require(driver.install_addon(str(extension), temporary=True) == addon_id, "Unexpected installed add-on ID")
        print("Installed unchanged Firefox artifact; discovering its public Manifest URL", flush=True)
        report["stage"] = "discover-manifest-url"
        driver.get("about:debugging#/runtime/this-firefox")
        links = WebDriverWait(driver, 20).until(
            lambda current: (urls if len(urls := current.execute_script(MANIFEST_LINK, addon_id)) == 1 else False),
            "Could not identify the installed extension's Manifest URL in about:debugging",
        )
        (artifacts / "about-debugging.html").write_text(driver.page_source, encoding="utf-8")
        url = urlsplit(links[0])
        require(url.scheme == "moz-extension" and bool(url.netloc) and url.path == "/manifest.json",
                "Unexpected Manifest URL", links)
        origin = f"{url.scheme}://{url.netloc}"
        report["observedManifestUrl"] = links[0]
        report["stage"] = "options-api-bridge"
        driver.get(origin + "/" + manifest["options_ui"]["page"].lstrip("/"))
        WebDriverWait(driver, 20).until(lambda current: current.execute_script(
            "return document.body.classList.contains('is-options-page') && "
            "document.getElementById('settings-fields')?.disabled === false;"))
        require(driver.execute_script("return browser.runtime.id") == addon_id, "Options page belongs to another extension")
        require(driver.execute_script("return typeof browser.action.openPopup") == "function", "action.openPopup unavailable")

        def open_popup():
            call_async(driver, "await browser.action.openPopup(); return true;")
            return wait_popup(driver)

        def motion_tab():
            driver.execute_script("browser.extension.getViews({type:'popup'})[0].document.getElementById('tab-motion').click();")
            return WebDriverWait(driver, 10, poll_frequency=0.15).until(
                lambda current: (state if (state := snapshot(current)).get("activeTab") == "motion" and
                                 state["boxes"]["#cfg-ambientIntensity"]["visible"] else False))

        report["stage"] = "first-native-open"
        initial = open_popup()
        check_layout(initial)
        report["steps"]["initial"] = initial
        capture_desktop(artifacts, "native-firefox-popup-appearance", report)
        report["stage"] = "native-motion-controls"
        motion = motion_tab()
        check_layout(motion, motion=True)
        report["steps"]["motion"] = motion
        capture_desktop(artifacts, "native-firefox-popup-motion", report)
        driver.execute_script("""
            const win = browser.extension.getViews({type:'popup'})[0], doc = win.document;
            doc.querySelector('[data-choice="ambientStyle"][data-value="spotlight"]').click();
            const range = doc.getElementById('cfg-ambientIntensity');
            range.value = '77';
            range.dispatchEvent(new win.Event('input', {bubbles:true}));
            range.dispatchEvent(new win.Event('change', {bubbles:true}));
        """)
        report["stage"] = "persist-popup-controls"
        saved = WebDriverWait(driver, 20, poll_frequency=0.2).until(lambda current: (
            value if (value := call_async(current, """
                const key = ObsidianPrismSchema.STORAGE_KEY;
                const values = await browser.storage.local.get(key);
                const cfg = values[key];
                return cfg ? {ambientStyle:cfg.ambientStyle, ambientIntensity:cfg.ambientIntensity,
                  thoughtTranslate:cfg.thoughtTranslate} : null;
            """)) and value["ambientStyle"] == "spotlight" and value["ambientIntensity"] == 77 else False
        ), "Changes made through native popup controls were not saved")
        require(saved["thoughtTranslate"] is False, "Optional remote translation must remain disabled")
        report["steps"]["savedConfig"] = saved
        driver.execute_script("browser.extension.getViews({type:'popup'})[0].close();")
        WebDriverWait(driver, 10).until(lambda current: current.execute_script("return browser.extension.getViews({type:'popup'}).length === 0;"))
        report["stage"] = "native-close-and-reopen"
        reopened = open_popup()
        check_layout(reopened)
        require(reopened["timeOrigin"] != initial["timeOrigin"], "Popup was not recreated after close")
        require(reopened["ambientStyle"] == "spotlight" and reopened["ambientIntensity"] == "77" and
                reopened["previewStyle"] == "spotlight" and reopened["spotlightPressed"] == "true",
                "Reopened popup did not restore the saved controls and preview", reopened)
        report["steps"]["reopened"] = reopened
        reopened_motion = motion_tab()
        check_layout(reopened_motion, motion=True)
        report["steps"]["reopenedMotion"] = reopened_motion
        capture_desktop(artifacts, "native-firefox-popup-reopened", report)
        report["status"] = "passed"
        print("PASS: native Firefox popup size, visible controls, saving, and reopening", flush=True)
    except Exception as error:
        report["status"] = "failed"
        report["error"] = {"type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
        if driver:
            try:
                report["currentUrl"] = driver.current_url
                (artifacts / "failure-page.html").write_text(driver.page_source, encoding="utf-8")
                capture_desktop(artifacts, "native-firefox-failure", report)
            except Exception as diagnostic_error:
                report["diagnosticError"] = str(diagnostic_error)
        raise
    finally:
        (artifacts / "native-firefox-popup.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if driver:
            driver.quit()


if __name__ == "__main__":
    main()
