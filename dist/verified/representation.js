export const maybe = (value) => value === undefined ? { $: 'None' } : { $: 'Some', value };
export const optional = (value) => value.$ === 'Some' ? value.value : undefined;
export function list(values) {
    let result = { $: 'Nil' };
    for (let index = values.length - 1; index >= 0; index--)
        result = { $: 'Con', head: values[index], tail: result };
    return result;
}
export function array(values) {
    const result = [];
    for (let node = values; node.$ === 'Con'; node = node.tail)
        result.push(node.head);
    return result;
}
//# sourceMappingURL=representation.js.map