import assert from 'node:assert/strict';

export async function rushSeed(page,kind){
  const src=await page.locator('iframe[title]').getAttribute('src');
  const params=new URL(src,'http://localhost').searchParams;
  assert.ok(params.get('run'),'Rush frames must belong to a run');
  return `rush:${kind}:${params.get('date')}:${params.get('run')}`;
}
