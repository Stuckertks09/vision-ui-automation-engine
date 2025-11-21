//browser.js
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

//
// ──────────────────────────────────────────────────────────────
//  Launch Browser (with storageState)
// ──────────────────────────────────────────────────────────────
//
export async function launchBrowser(headless = false, storageStatePath = null) {
  console.log("🚀 Launching Chromium...");

  const browser = await chromium.launch({
    headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  let context;

  if (storageStatePath) {
    const resolved = path.resolve(storageStatePath);
    if (fs.existsSync(resolved)) {
      console.log("🔐 Using storage state:", resolved);

      context = await browser.newContext({
        storageState: resolved,
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
      });
    } else {
      console.warn("⚠️ StorageState file not found:", resolved);
      context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
      });
    }
  } else {
    console.warn("⚠️ No storageState provided");
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });
  }

  const page = await context.newPage();
  return { browser, context, page };
}

//
// ──────────────────────────────────────────────────────────────
//  Safe Navigation
// ──────────────────────────────────────────────────────────────
//
export async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(200);
    await page.waitForLoadState("domcontentloaded");

    try {
      await page.waitForLoadState("networkidle", { timeout: 2000 });
    } catch { /* ignored for SPA apps */ }

  } catch (err) {
    console.error("Goto error:", err);
    throw err;
  }
}

//
// ──────────────────────────────────────────────────────────────
//  Normal Click
// ──────────────────────────────────────────────────────────────
//
export async function safeClick(page, selector) {
  try {
    await page.click(selector, { timeout: 3000 });
    await page.waitForTimeout(250);
  } catch (err) {
    console.warn(`❌ Click failed: ${selector}`, err);
    throw err;
  }
}

//
// ──────────────────────────────────────────────────────────────
//  Bounding Box Click (fallback for LLM actions)
// ──────────────────────────────────────────────────────────────
//
export async function clickBoundingBox(page, box) {
  if (!box) return;

  const { x, y, width, height } = box;
  const cx = x + width / 2;
  const cy = y + height / 2;

  try {
    // Move cursor like a human
    await page.mouse.move(cx, cy, { steps: 10 });

    // Real physical-gesture click
    await page.mouse.down({ button: "left" });
    await page.waitForTimeout(35); // important!
    await page.mouse.up({ button: "left" });

    console.log(`✓ Real mouse click at ${cx}, ${cy}`);
  } catch (err) {
    console.error("Bounding box REAL click failed:", err);
    throw err;
  }
}

//
// ──────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
//  DOM Snapshot — FILTER OUT GHOST / NON-INTERACTIVE ELEMENTS
// ──────────────────────────────────────────────────────────────
export async function getDomSnapshot(page) {
  return await page.evaluate(() => {
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      return (
        rect.width > 20 &&
        rect.height > 20 &&
        rect.top >= 0 &&
        rect.left >= 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0" &&
        el.offsetParent !== null
      );
    }

    const selectors = [
  "button",
  "a",
  "input",
  "textarea",
  "[role='button']",
  "[data-testid]",
  "select",
  "div[contenteditable='true']",
  "span[contenteditable='true']",
  ".ProseMirror",
  "[role='menu']",
  "[role='menuitem']",
  "[role='listbox']",
  "[role='option']",
  "div[style*='position: fixed']",
  "div[style*='z-index']"
];

    const elements = [...document.querySelectorAll(selectors.join(", "))];

    return elements
      .filter(el => isVisible(el))
      .map(el => {
        const rect = el.getBoundingClientRect();
        const hasReactEvent = Object.keys(el).some(k => 
          k.startsWith("__react") || k.includes("Fiber")
        );

        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role"),
          text: el.innerText?.trim() || null,
          placeholder: el.placeholder || null,
          contentEditable: el.getAttribute("contenteditable") || null,
          isProseMirror: el.classList.contains("ProseMirror"),

          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
          },

          id: el.id || null,
          classes: el.className || null,
          reactEvent: hasReactEvent
        };
      });
  });
}


//
// ──────────────────────────────────────────────────────────────
//  Screenshot (Buffer)
// ──────────────────────────────────────────────────────────────
//
export async function captureScreenshot(page) {
  return await page.screenshot({
    type: "png",
    fullPage: false,
  });
}

//
// ──────────────────────────────────────────────────────────────
//  Smart Scroll (optional helper)
// ──────────────────────────────────────────────────────────────
//
export async function smartScroll(page, action) {
  if (action.action !== "scroll") return;

  await page.evaluate((dir) => {
    window.scrollBy({
      top: dir === "down" ? 400 : -400,
      behavior: "smooth",
    });
  }, action.direction || "down");

  await page.waitForTimeout(400);
}
