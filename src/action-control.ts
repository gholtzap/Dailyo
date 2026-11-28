import { element as el } from "./dom.js";

type ActionIcon = "review" | "skip" | "pause";

// Keep the button alive when its meaning changes: rebuilding a pressed control
// can cancel the click in WebKit.
export function setActionLabel(
  button: HTMLElement,
  label: string,
  icon?: ActionIcon,
) {
  let group = button.parentElement;
  if (!group?.classList.contains("action-control")) {
    group = el("span", undefined, "action-control");
    button.before(group);
    const tip = el("span", undefined, "game-tooltip");
    tip.id = `${button.id}-tooltip`;
    tip.setAttribute("role", "tooltip");
    group.append(button, tip);
    const dismiss = () => group!.setAttribute("data-tooltip-dismissed", "");
    const restore = () => group!.removeAttribute("data-tooltip-dismissed");
    group.addEventListener("keydown", (event) => {
      if (event.key === "Escape") dismiss();
    });
    group.addEventListener("mouseleave", restore);
    group.addEventListener("focusout", restore);
  }
  if (
    button.dataset.actionLabel === label &&
    button.dataset.actionIcon === (icon ?? "")
  )
    return;
  button.dataset.actionLabel = label;
  button.dataset.actionIcon = icon ?? "";
  button.setAttribute("aria-label", label);
  const tip = group.querySelector<HTMLElement>(".game-tooltip")!;
  tip.textContent = label;
  tip.hidden = !icon;
  group.removeAttribute("data-tooltip-dismissed");
  if (icon) {
    const glyph = el("span", undefined, "action-glyph");
    glyph.dataset.icon = icon;
    glyph.setAttribute("aria-hidden", "true");
    const text = el("span", label, "screen-reader-only");
    button.replaceChildren(glyph, text);
    button.setAttribute("aria-describedby", tip.id);
  } else {
    button.textContent = label;
    button.removeAttribute("aria-describedby");
  }
}
