const moreGames = document.querySelector('.site-more');

if (moreGames) {
  const toggle = moreGames.querySelector('summary');
  document.addEventListener('click', event => {
    if (!moreGames.contains(event.target) || event.target.closest('a')) moreGames.open = false;
  });
  moreGames.addEventListener('focusout', event => {
    if (event.relatedTarget && !moreGames.contains(event.relatedTarget)) moreGames.open = false;
  });
  moreGames.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !moreGames.open) return;
    event.preventDefault();
    moreGames.open = false;
    toggle.focus();
  });
}
