import { gameName } from "./game-names.js";
for (const title of document.querySelectorAll(".game-title")) {
    title.textContent = gameName(document.body.dataset.game ?? title.textContent ?? "");
}
for (const moreGames of document.querySelectorAll(".site-more")) {
    const toggle = moreGames.querySelector("summary");
    document.addEventListener("click", (event) => {
        if (!moreGames.contains(event.target) ||
            (event.target instanceof Element && event.target.closest("a")))
            moreGames.open = false;
    });
    // Focus entering an embedded game does not bubble to the parent document.
    window.addEventListener("blur", () => queueMicrotask(() => {
        if (document.activeElement instanceof HTMLIFrameElement)
            moreGames.open = false;
    }));
    moreGames.addEventListener("focusout", (event) => {
        if (event.relatedTarget && !moreGames.contains(event.relatedTarget))
            moreGames.open = false;
    });
    moreGames.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !moreGames.open)
            return;
        event.preventDefault();
        moreGames.open = false;
        toggle?.focus();
    });
}
//# sourceMappingURL=site.js.map