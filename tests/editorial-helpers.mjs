import assert from "node:assert/strict";

// Exercise the rendered player experience, including dialogs, rather than source strings.
export async function assertEditorialUI(surface) {
  const text = await surface.locator("body").evaluate((body) => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest(
          "script, style, .screen-reader-only, .quiz-answer-status, [hidden]",
        )
      )
        continue;
      if (
        !parent.checkVisibility({
          opacityProperty: true,
          visibilityProperty: true,
        })
      )
        continue;
      parts.push(node.textContent);
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  });
  assert.doesNotMatch(
    text,
    /\b(?:trainrot|flagrot|langrot|maprot|yearrot|borderrot|ladderrot|cluerot|scalerot|swaprot|skyrot|pricerot|skylinerot|zoomrot|orderrot|countrot|trackrot|anglerot|temporot|splitrot)\b/,
  );
  assert.doesNotMatch(
    text,
    /Rush tolerance|70 needed to continue|Image resized and cropped|Look for the buildings|puzzles completed|Build your sense of history|Find the finer distinctions|A gentle place to start|Values are shown in a common unit|No machine-readable author|GitHub repository|Swipe up here|Try again with the new clue|Choose a tile beside it|You found a shortest solution|Practice variation|Use Practice to play more|An example sentence appears|Scores measure your timing against the reference schedule|Daily and Rush use Standard|Next daily set at midnight/,
  );
  assert.doesNotMatch(text, /\bView \d of 3 · One guess\b/);
  assert.doesNotMatch(text, /Review answers\s+Review answers/);
  assert.doesNotMatch(text, /(?:Daily|Practice) results/);
  return text;
}
