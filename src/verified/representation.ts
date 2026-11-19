/** Bend's JS boundary representation. Domain values stay in TypeScript. */
export type Maybe<T> = {$: 'None'} | {$: 'Some'; value: T};
export type List<T> = {$: 'Nil'} | {$: 'Con'; head: T; tail: List<T>};
export const maybe = <T>(value: T | undefined): Maybe<T> => value === undefined ? {$: 'None'} : {$: 'Some', value};
export const optional = <T>(value: Maybe<T>): T | undefined => value.$ === 'Some' ? value.value : undefined;
export function list<T>(values: readonly T[]): List<T> {
  let result: List<T> = {$: 'Nil'};
  for (let index = values.length - 1; index >= 0; index--) result = {$: 'Con', head: values[index], tail: result};
  return result;
}
export function array<T>(values: List<T>): T[] {
  const result: T[] = [];
  for (let node = values; node.$ === 'Con'; node = node.tail) result.push(node.head);
  return result;
}
