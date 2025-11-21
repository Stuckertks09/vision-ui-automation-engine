import { getOpenAI } from "../utils/openaiClient.js";

/* ------------------------------------------------------------
   NATURAL LANGUAGE → IMPERATIVE NORMALIZATION
-------------------------------------------------------------*/
function normalizeGoal(originalGoal) {
  let goal = originalGoal.trim();
  const lower = goal.toLowerCase();

  const teachingPatterns = [
    /^how do i\s+/i,
    /^how to\s+/i,
    /^show me how to\s+/i,
    /^show me\s+/i,
    /^teach me how to\s+/i,
    /^walk me through\s+/i,
    /^guide me through\s+/i,
    /^what is the way to\s+/i,
    /^what's the way to\s+/i,
    /^explain how to\s+/i,
    /^help me\s+/i,
  ];

  for (const pattern of teachingPatterns) {
    if (pattern.test(lower)) {
      return goal.replace(pattern, "").trim();
    }
  }

  if (lower.startsWith("how do i")) {
    return goal.replace(/^how do i\s+/i, "").trim();
  }

  return goal;
}

/* ------------------------------------------------------------
                    MAIN ACTION PLANNER
-------------------------------------------------------------*/
export async function planAction({ goal, screenshotBase64, dom }) {
  const openai = getOpenAI();
  const normalizedGoal = normalizeGoal(goal);

  const prompt = `
You are **Agent B**, an autonomous UI navigation agent.

You get:
1. A screenshot of the current UI.
2. A DOM snapshot (array of interactive elements with tag, role, text, boundingBox, etc).

Your job:  
**Return ONE next action** that moves toward completing the user's task.

-------------------------------------------
TASK GOAL (normalized):
"${normalizedGoal}"

ORIGINAL USER GOAL:
"${goal}"
-------------------------------------------

DOM SNAPSHOT (first 50 elements):
${JSON.stringify(dom.slice(0, 50), null, 2)}

-------------------------------------------
CRITICAL RULES ABOUT ACTION FIELDS
-------------------------------------------

1. **selector vs boundingBox (Option A)**
   - If you can identify the target element by a robust CSS selector,
     set \`selector\` to that value and set \`boundingBox\` to null.
   - Only use \`boundingBox\` when:
       - there is NO reliable selector, AND
       - you MUST click based on coordinates.
   - Never set both to meaningful values: if \`selector\` is non-null,
     \`boundingBox\` SHOULD be null.
-When multiple elements match similar text or purpose, ALWAYS choose the one
with the LARGEST boundingBox area (width × height).  
This prevents clicking small sidebar items or background UI when a primary
on-page or modal action exists.

2. **Dropdown options (desiredOption)**
   - When you need to select an option INSIDE an already-open dropdown menu:
       - Set \`action\` to "click".
       - Set \`desiredOption\` to the VISIBLE LABEL of the option
         you want to choose (e.g. "Last visited page").
       - Set \`selector\` to null.
       - Set \`boundingBox\` to null.
   - The executor will resolve and click the menu item by text
     using [role="menuitem"], [role="option"], etc.
   - Example:
       {
         "action": "click",
         "selector": null,
         "desiredOption": "Last visited page",
         "text": "",
         "direction": null,
         "boundingBox": null,
         "reason": "Select 'Last visited page' in the open dropdown."
       }

3. **Clicking dropdown OPENERS**
   - When you click the element that OPENS a dropdown:
       - Use a selector that matches the button/label, e.g.
         "div[role='button']:has-text('Top page in sidebar')".
       - Set \`desiredOption\` to null.
       - Set \`boundingBox\` to null.

4. **Typing**
   - For "type" actions:
       - \`text\` must be the string to type.
       - \`selector\` should point to the input/textarea/contenteditable if possible.
       - \`boundingBox\` should normally be null.

5. **Scrolling**
   - "scroll" actions:
       - \`direction\` is "down" or "up".
       - \`selector\` and \`boundingBox\` are usually null unless you need to
         scroll a specific scrollable container.

6. **Avoid loops**
   - Do NOT repeatedly click the same element without any visible change.
   - If you're stuck, prefer "scroll" to reveal more UI or "wait" briefly.

7. **Completion**
   - Use "done" ONLY when it's obvious the goal is satisfied
     (e.g. a "Project created" confirmation appears or the settings clearly show the target state).

8. ABSOLUTE RULE:  
Actions MUST reference ONLY elements present in the DOM snapshot.  
If an element is not present in the snapshot (missing text, missing role, etc.)  
you must NOT click it, reference it, or create selectors for it.



-------------------------------------------
STRICT JSON RESPONSE (no extra text):
{
  "action": "click" | "type" | "scroll" | "wait" | "done",
  "selector": string | null,
  "desiredOption": string | null,
  "text": string,
  "direction": "down" | "up" | null,
  "boundingBox": { "x": number, "y": number, "width": number, "height": number } | null,
  "reason": string
}
-------------------------------------------
`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.1,
      messages: [
        { role: "system", content: "You are a precise UI action planner. Always follow the JSON schema exactly." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${screenshotBase64}` },
            },
          ],
        },
      ],
    });

    const raw = res.choices?.[0]?.message?.content;

    if (!raw) {
      console.warn("⚠️ No LLM output — fallback scroll.");
      return fallbackScroll("missing output");
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn("⚠️ Invalid JSON from LLM — fallback scroll.", raw);
      return fallbackScroll("invalid JSON");
    }

    // Hard enforcement of Option A: selector > boundingBox
    if (parsed.selector) {
      parsed.boundingBox = null;
    }

    if (!("desiredOption" in parsed)) {
      parsed.desiredOption = null;
    }

    return parsed;
  } catch (err) {
    console.error("❌ planAction() LLM error:", err);
    return fallbackScroll("OpenAI error");
  }
}

function fallbackScroll(reason) {
  return {
    action: "scroll",
    direction: "down",
    selector: null,
    desiredOption: null,
    boundingBox: null,
    text: "",
    reason: `fallback: ${reason}`,
  };
}
