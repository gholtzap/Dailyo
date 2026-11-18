export function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined)
        node.textContent = text;
    if (className)
        node.className = className;
    return node;
}
export function required(selector) {
    const node = document.querySelector(selector);
    if (!node)
        throw new Error(`Missing required element: ${selector}`);
    return node;
}
export function recordValue(record, key) { return record[key]; }
//# sourceMappingURL=dom.js.map