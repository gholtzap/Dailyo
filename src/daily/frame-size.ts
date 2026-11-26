import { designValue } from "../design.js";

// Keep the puzzle in the page's scroll flow instead of clipping it inside a
// second viewport. Observe the content, not document.scrollHeight (which also
// includes the iframe's current viewport and cannot shrink between states).
export function sizeFeedFrame(frame: HTMLIFrameElement) {
  let content: ResizeObserver | undefined;
  let dialogs: MutationObserver | undefined;
  let pending = 0;
  let wasVisible = false;
  const panel = frame.parentElement!;
  frame.dataset.contentSized = "";
  const measure = () => {
    pending = 0;
    if (!frame.isConnected) return dispose();
    const visible =
      !frame.hidden &&
      !!frame.title &&
      !frame.classList.contains("feed-loading");
    if (!visible) {
      wasVisible = false;
      return;
    }
    const doc = frame.contentDocument;
    const main = doc?.querySelector("main");
    if (!doc || !main) return;
    const style = getComputedStyle(main);
    const dialog = doc.querySelector<HTMLDialogElement>("#help-dialog[open]");
    const dialogStyle = dialog && getComputedStyle(dialog);
    const dialogHeight =
      dialog && dialogStyle
        ? dialog.scrollHeight +
          parseFloat(dialogStyle.borderTopWidth) +
          parseFloat(dialogStyle.borderBottomWidth) +
          Number.parseFloat(designValue("--space-8"))
        : 0;
    const height = Math.ceil(
      Math.max(
        Math.max(main.scrollHeight, main.getBoundingClientRect().height) +
          parseFloat(style.marginTop) +
          parseFloat(style.marginBottom),
        dialogHeight,
      ),
    );
    if (height && frame.style.height !== `${height}px`) {
      frame.style.height = `${height}px`;
      // Viewport-dependent content can change overflow without resizing main.
      schedule();
    }
    if (!wasVisible) window.scrollTo({ top: 0, behavior: "instant" });
    wasVisible = true;
  };
  const schedule = () => {
    if (!pending) pending = requestAnimationFrame(measure);
  };
  const attributes = new MutationObserver(schedule);
  attributes.observe(frame, {
    attributes: true,
    attributeFilter: ["class", "hidden", "title"],
  });
  const removal = new MutationObserver(() => {
    if (!frame.isConnected) dispose();
  });
  removal.observe(panel, { childList: true });
  function connect() {
    content?.disconnect();
    dialogs?.disconnect();
    const doc = frame.contentDocument;
    if (doc?.body) {
      dialogs = new MutationObserver(schedule);
      dialogs.observe(doc.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ["open"],
        childList: true,
      });
    }
    const main = doc?.querySelector("main");
    if (main) {
      content = new ResizeObserver(schedule);
      content.observe(main);
    }
    schedule();
  }
  function dispose() {
    cancelAnimationFrame(pending);
    content?.disconnect();
    dialogs?.disconnect();
    attributes.disconnect();
    removal.disconnect();
    frame.removeEventListener("load", connect);
    window.removeEventListener("resize", schedule);
  }
  frame.addEventListener("load", connect);
  window.addEventListener("resize", schedule);
  connect();
}
