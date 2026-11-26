// Keep the puzzle in the page's scroll flow instead of clipping it inside a
// second viewport. Observe the content, not document.scrollHeight (which also
// includes the iframe's current viewport and cannot shrink between states).
export function sizeFeedFrame(frame: HTMLIFrameElement) {
  let content: ResizeObserver | undefined;
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
    const height = Math.ceil(
      Math.max(main.scrollHeight, main.getBoundingClientRect().height) +
        parseFloat(style.marginTop) +
        parseFloat(style.marginBottom),
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
    const main = frame.contentDocument?.querySelector("main");
    if (main) {
      content = new ResizeObserver(schedule);
      content.observe(main);
    }
    schedule();
  }
  function dispose() {
    cancelAnimationFrame(pending);
    content?.disconnect();
    attributes.disconnect();
    removal.disconnect();
    frame.removeEventListener("load", connect);
    window.removeEventListener("resize", schedule);
  }
  frame.addEventListener("load", connect);
  window.addEventListener("resize", schedule);
  connect();
}
