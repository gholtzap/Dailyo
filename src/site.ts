for (const moreGames of document.querySelectorAll<HTMLDetailsElement>('.site-more')) {
  const toggle = moreGames.querySelector('summary');
  document.addEventListener('click', event => {
    if (!moreGames.contains(event.target as Node | null) || (event.target instanceof Element && event.target.closest('a'))) moreGames.open = false;
  });
  moreGames.addEventListener('focusout', event => {
    if (event.relatedTarget && !moreGames.contains(event.relatedTarget as Node)) moreGames.open = false;
  });
  moreGames.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !moreGames.open) return;
    event.preventDefault();
    moreGames.open = false;
    toggle?.focus();
  });
}
