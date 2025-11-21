// actionExecutor.js
import { clickBoundingBox } from "./browser.js";

/* ------------------------------------------------------------
   Helper: Blur active editor
-------------------------------------------------------------*/
async function blurActiveEditor(page) {
  try {
    // Try multiple blank, non-interactive spots
    const spots = [
      { x: 30, y: 150 },  // left sidebar padding
      { x: 300, y: 100 }, // top layout gutter
      { x: 60, y: 420 },  // left vertical gutter
    ];

    for (const s of spots) {
      await page.mouse.click(s.x, s.y);
      await page.waitForTimeout(100);

      const stillFocused = await page.evaluate(() => {
        const ae = document.activeElement;
        return ae && (ae.getAttribute("contenteditable") === "true");
      });

      if (!stillFocused) {
        console.log("✓ Blur editor (Linear commit)");
        return;
      }
    }

    console.warn("⚠️ Unable to blur editor — still focused");
  } catch (err) {
    console.warn("⚠️ Blur error:", err);
  }
}

/* ------------------------------------------------------------
   Helper: Smooth human-style click 
-------------------------------------------------------------*/
async function humanClick(page, box) {
  const { x, y, width, height } = box;
  const cx = x + width / 2;
  const cy = y + height / 2;

  await page.mouse.move(cx, cy, { steps: 10 });
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.move(cx + 2, cy + 1, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

/* ------------------------------------------------------------
   Helper: Auto-dismiss discard modal BEFORE any action runs
-------------------------------------------------------------*/
async function clearModals(page) {
  try {
    // Detect any dialog element
    const dialog = await page.$("[role='dialog']");
    if (!dialog) return false;

    // Extract dialog text safely
    const dialogText = await dialog.innerText().catch(() => "");

    // Heuristic: Real discard modal must contain BOTH Cancel + Discard
    const hasCancel = dialogText.includes("Cancel");
    const hasDiscard = dialogText.includes("Discard");

    const looksLikeDiscardModal =
      hasCancel &&
      hasDiscard &&
      /unsaved|discard|changes|sure/i.test(dialogText); // Only clear THIS kind of modal

    if (!looksLikeDiscardModal) {
      // Not a discard popup − do NOT auto-clear
      return false;
    }

    console.log("⚠️ Real Discard modal detected — clearing");

    // Find cancel button inside THIS dialog only
    const cancelBtn = await dialog.$("button:has-text('Cancel')");
    if (cancelBtn) {
      await cancelBtn.click({ delay: 40 });
      await page.waitForTimeout(250);
      console.log("✓ Discard modal dismissed");
      return true;
    }

    return false;

  } catch (err) {
    console.warn("⚠️ Modal clear error:", err);
    return false;
  }
}

/* ------------------------------------------------------------
                     MAIN EXECUTION ROUTER
-------------------------------------------------------------*/
export async function executeAction(page, action) {
  // 🔥 STEP 0 — Auto-clear discard modal FIRST
  const cleared = await clearModals(page);
  if (cleared) {
    console.log("✓ Modal cleared — skipping planned action this step");
    return "continue";
  }

  switch (action.action) {

/* ------------------------------------------------------------
                           CLICK
-------------------------------------------------------------*/
case "click": {
  let box = null;
  let center = null;

  /* ---------------------------------------------------------
     0. DROPDOWN OPTION CLICK (react-safe ONLY)
     Triggered when selector=null AND desiredOption is set.
  ----------------------------------------------------------*/
  if (action.desiredOption) {
    console.log("🎯 Selecting dropdown option:", action.desiredOption);

    const selected = await page.evaluate((desired) => {
      desired = desired.toLowerCase();

      const options = Array.from(
        document.querySelectorAll(
          '[role="menuitem"], [role="option"], [data-menu-item], [data-testid*="option"]'
        )
      );

      const match = options.find((el) =>
        (el.innerText || "").trim().toLowerCase().includes(desired)
      );

      if (!match) return false;

      // Simulate React-driven menu click
      match.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      match.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      match.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      return true;
    }, action.desiredOption);

    if (selected) {
      console.log("🎉 Dropdown option selected:", action.desiredOption);
      await page.waitForTimeout(150);
    } else {
      console.warn("⚠️ Dropdown option not found:", action.desiredOption);
    }

    return "continue";
  }

  /* ---------------------------------------------------------
     1. Resolve CLICK TARGET (selector → boundingBox)
  ----------------------------------------------------------*/
  if (action.selector) {
    try {
      const el = await page.waitForSelector(action.selector, {
        state: "visible",
        timeout: 800,
      });
      if (el) box = await el.boundingBox();
    } catch {}
  }

  if (!box && action.boundingBox) box = action.boundingBox;

  if (!box) {
    console.warn("⚠️ No valid element found for click");
    return "continue";
  }

  center = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };

  /* ---------------------------------------------------------
     2. PERFORM NORMAL CLICK (EVERYTHING EXCEPT DROPDOWN ITEMS)
  ----------------------------------------------------------*/
  console.log("✓ humanClick");
  await humanClick(page, box);

  return "continue";
}



/* ------------------------------------------------------------
                            TYPE
-------------------------------------------------------------*/
case "type": {
  const text = action.text || "";
  let targetSelector = null;

 /* ------------------------------------------------------------
   0. UNIVERSAL EDITABLE RESOLUTION (app-agnostic)
-------------------------------------------------------------*/
targetSelector = await page.evaluate(() => {
  function findEditable(el) {
    return (
      el.closest('[contenteditable="true"]') ||
      el.querySelector('[contenteditable="true"]')
    );
  }

  /* ------------------------------------------------------------
     Step A — detect nested contenteditable nodes
  ------------------------------------------------------------- */
  const richEditors = Array.from(
    document.querySelectorAll('[contenteditable="true"]')
  ).filter(ed => {
    const rect = ed.getBoundingClientRect();
    return rect.width > 50 && rect.height > 18;
  });

  if (richEditors.length > 0) {
    richEditors[0].setAttribute("data-agent-target", "editable");
    return '[data-agent-target="editable"]';
  }

  /* ------------------------------------------------------------
     Step B — Title Heuristic:
     - large visible DIV near top
     - no ProseMirror
     - no input
     - minimal children
     - contains simple text
  ------------------------------------------------------------- */
  const candidates = Array.from(document.querySelectorAll("div"))
    .filter(el => {
      const rect = el.getBoundingClientRect();

      if (rect.top > 200) return false;              // top of page
      if (rect.width < 150 || rect.height < 25) return false;

      const txt = el.innerText?.trim() || "";
      if (!txt) return false;

      // exclude real editors
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return false;
      if (el.classList.contains("ProseMirror")) return false;

      // exclude complex structural divs
      if (el.children.length > 3) return false;

      return true;
    });

  if (candidates.length > 0) {
    const topCandidate = candidates[0];
    topCandidate.setAttribute("data-agent-notion-title", "true");
    return '[data-agent-notion-title="true"]';
  }

  return null;
});

  /* ------------------------------------------------------------
     1. MODAL-PROSEMIRROR FORCE-TARGET 
     ------------------------------------------------------------ */
  if (!targetSelector) {
    targetSelector = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return null;

      const editors = Array.from(modal.querySelectorAll('.ProseMirror'));
      if (!editors.length) return null;

      const titleEditor = editors[0];
      titleEditor.setAttribute("data-agent-title-editor", "true");
      return '[data-agent-title-editor="true"]';
    });

    if (targetSelector) {
      console.log("🎯 FORCE-TARGET: Linear ProseMirror:", targetSelector);
    }
  }

  /* ------------------------------------------------------------
     2. USE EXPLICIT SELECTOR IF LLM PROVIDED ONE
  ------------------------------------------------------------- */
  if (!targetSelector && action.selector) {
    targetSelector = action.selector;
  }

  /* ------------------------------------------------------------
     3. RESOLVE FROM BOUNDING BOX (generic fallback)
  ------------------------------------------------------------- */
  if (!targetSelector && action.boundingBox) {
    const { x, y, width, height } = action.boundingBox;
    const cx = x + width / 2;
    const cy = y + height / 2;

    targetSelector = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;

      // direct editable
      if (el.getAttribute("contenteditable") === "true" || el.classList.contains("ProseMirror")) {
        el.setAttribute("data-agent-target", "pm-editor");
        return '[data-agent-target="pm-editor"]';
      }

      // direct input
      if (el.tagName === "INPUT") {
        if (el.id) return `#${el.id}`;
        if (el.name) return `input[name="${el.name}"]`;
        el.setAttribute("data-agent-target", "input");
        return '[data-agent-target="input"]';
      }

      // nested editable field
      const nested = el.querySelector("input, [contenteditable='true'], .ProseMirror");
      if (nested) {
        nested.setAttribute("data-agent-target", "nested-editor");
        return '[data-agent-target="nested-editor"]';
      }

      return null;
    }, { x: cx, y: cy });
  }

  /* ------------------------------------------------------------
     4. FAIL IF STILL NOTHING
  ------------------------------------------------------------- */
  if (!targetSelector) {
    console.warn("⚠️ Could not determine input target");
    return "continue";
  }

  /* ------------------------------------------------------------
     5. FOCUS TARGET
  ------------------------------------------------------------- */
  await page.click(targetSelector, { delay: 40 });
  await page.waitForTimeout(200);

  /* ------------------------------------------------------------
     6. CLEAR EXISTING CONTENT
  ------------------------------------------------------------- */
  await page.keyboard.down('Meta');
  await page.keyboard.press('A');
  await page.keyboard.up('Meta');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);

  /* ------------------------------------------------------------
     7. TYPE HUMAN-LIKE
  ------------------------------------------------------------- */
  await page.keyboard.type(text, { delay: 80 });
  console.log(`✓ Typed "${text}"`);
  await page.waitForTimeout(300);

  /* ------------------------------------------------------------
     8. COMMIT LOGIC 
  ------------------------------------------------------------- */
  await page.evaluate(() => {
    const editor =
      document.querySelector('[data-agent-title-editor="true"]') ||
      document.querySelector('[data-agent-notion-title="true"]');

    if (!editor) return;

    ['input', 'change', 'blur', 'focusout'].forEach(evt => {
      editor.dispatchEvent(new Event(evt, { bubbles: true }));
    });

    const key = Object.keys(editor).find(k =>
      k.startsWith("__reactProps") || k.startsWith("__reactFiber")
    );
    
    if (key && editor[key]?.onChange) {
      editor[key].onChange();
    }
  });

  /* ------------------------------------------------------------
   GENERALIZED COMMIT RULE FOR CONTENTEDITABLE TITLE FIELDS
   - If field is contenteditable
   - AND no "Create"/"Save" button is visible
   - THEN commit with Enter instead of blur/tab
------------------------------------------------------------- */
const needsEnterCommit = await page.evaluate(() => {
  const active = document.activeElement;
  if (!active) return false;

  const isEditable =
    active.getAttribute("contenteditable") === "true" ||
    active.tagName === "DIV" && active.closest('[contenteditable="true"]');

  if (!isEditable) return false;

  // Detect create/save buttons in the DOM
  const buttons = Array.from(document.querySelectorAll("button"))
    .map(b => b.textContent?.toLowerCase() || "");

  const hasSubmitButton = buttons.some(text =>
    text.includes("create") ||
    text.includes("save") ||
    text.includes("add") ||
    text.includes("new")
  );

  // If editable AND no submit button → commit with Enter
  return !hasSubmitButton;
});

if (needsEnterCommit) {
  console.log("🔵 Generic contenteditable commit via Enter (no submit button found)");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  return "continue"; 
}


  /* ------------------------------------------------------------
     9. BLUR / VALIDATION
  ------------------------------------------------------------- */
  await page.keyboard.press("Tab");
  await page.waitForTimeout(300);

  return "continue";
}


/* ------------------------------------------------------------
                        OTHER ACTIONS
-------------------------------------------------------------*/
    case "press":
      await page.keyboard.press(action.key);
      return "continue";

    case "wait":
      await page.waitForTimeout(action.ms ?? 1000);
      return "continue";

 case "scroll": {
  const direction = action.direction || "down";
  const delta = direction === "down" ? 400 : -400;

  await page.evaluate(async ({ delta, box }) => {

    function findScrollableAncestor(el) {
      while (el) {
        const style = window.getComputedStyle(el);

        const overflowY = style.overflowY;
        const scrollable =
          (overflowY === "auto" || overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight + 10;

        if (scrollable) return el;
        el = el.parentElement;
      }
      return null;
    }

    // 1. Try scroll element under bounding box
    let scroller = null;

    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      const hit = document.elementFromPoint(cx, cy);
      if (hit) scroller = findScrollableAncestor(hit);
    }

    // 2. Fallback: find the *largest* scrollable element in the DOM
    if (!scroller) {
      const all = Array.from(document.querySelectorAll("*"));
      const scrollables = all.filter(el => {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        return (
          (overflowY === "auto" || overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight + 20
        );
      });

      if (scrollables.length > 0) {
        scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight);
        scroller = scrollables[0];
      }
    }

    // 3. Final fallback: scroll window
    if (!scroller) scroller = window;

    // 4. Apply scroll
    if (scroller === window) {
      window.scrollBy(0, delta);
    } else {
      scroller.scrollTop += delta;
    }

    // 5. Force layout + paint
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    // 6. Micro-jiggle to force bounding box refresh
    if (scroller === window) {
      window.scrollBy(0, 1);
      window.scrollBy(0, -1);
    } else {
      scroller.scrollTop += 1;
      scroller.scrollTop -= 1;
    }

  }, { delta, box: action.boundingBox || null });

  // 7. Wait for SPA animations/transitions
  await page.waitForTimeout(200);

  // 8. Refresh DOM snapshot after scroll
  try {
    if (typeof getDomSnapshot === "function") {
      page._lastSnapshot = await getDomSnapshot(page);
      console.log("🔄 DOM refreshed after scroll");
    }
  } catch (err) {
    console.warn("⚠️ DOM refresh failed:", err);
  }

  return "continue";
}


    case "scrollIntoView":
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, action.selector);
      return "continue";

    case "openDropdown":
      await page.click(action.selector);
      await page.waitForTimeout(250);
      return "continue";

    case "closeModal":
      await page.keyboard.press("Escape");
      return "continue";

    case "done":
      return "done";

    default:
      throw new Error(`Unknown action type: ${action.action}`);
  }
}
