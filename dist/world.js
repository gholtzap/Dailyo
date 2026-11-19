export { worldDailyChallenge } from './daily/puzzles.js';
export async function configureWorld() {
    const slug = document.body.dataset.worldCity;
    if (!slug)
        return null;
    if (location.pathname.replace(/\/$/, '') === '/trainrot-world') {
        location.replace('/trainrot-world/nyc/' + location.search);
        return new Promise(() => { });
    }
    const response = await fetch('/world-data/cities.json');
    if (!response.ok)
        throw new Error('City list did not load');
    const cities = await response.json(), city = cities.find(c => c.slug === slug);
    if (!city)
        throw new Error('Unknown city');
    const bar = document.createElement('section');
    bar.className = 'world-bar';
    bar.setAttribute('aria-label', 'Choose a city');
    const heading = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = city.name;
    const subtitle = document.createElement('p');
    subtitle.textContent = city.country;
    heading.append(title, subtitle);
    const change = document.createElement('button');
    change.id = 'change-city';
    change.className = 'secondary-button';
    change.textContent = 'Change city';
    change.setAttribute('aria-haspopup', 'dialog');
    bar.append(heading, change);
    document.querySelector('.site-header').before(bar);
    const dialog = document.createElement('dialog');
    dialog.id = 'world-city-dialog';
    dialog.className = 'world-city-dialog';
    dialog.setAttribute('aria-labelledby', 'world-cities-title');
    dialog.innerHTML = '<div class="world-dialog-heading"><h2 id="world-cities-title">Choose your city</h2><form method="dialog"><button type="submit" aria-label="Close city picker">Close</button></form></div><label for="city-search">Search cities or countries</label><input id="city-search" type="search" autocomplete="off"><p id="city-count" role="status"></p><ul id="city-results"></ul>';
    document.body.append(dialog);
    const search = dialog.querySelector('input'), list = dialog.querySelector('ul'), count = dialog.querySelector('#city-count');
    const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function render() {
        const term = normalize(search.value.trim());
        list.replaceChildren();
        const matches = cities.filter(c => normalize(`${c.name} ${c.country} ${c.slug} ${c.slug === 'nyc' ? 'New York NYC' : ''}`).includes(term)).sort((a, b) => a.name.localeCompare(b.name));
        count.textContent = `${matches.length} ${matches.length === 1 ? 'city' : 'cities'}`;
        for (const item of matches) {
            const li = document.createElement('li'), link = document.createElement('a'), name = document.createElement('strong'), country = document.createElement('span');
            link.href = `/trainrot-world/${item.slug}/`;
            name.textContent = item.name;
            country.textContent = item.country;
            if (item.slug === slug)
                link.setAttribute('aria-current', 'page');
            link.append(name, country);
            li.append(link);
            list.append(li);
        }
        if (!matches.length) {
            const li = document.createElement('li');
            li.className = 'world-no-results';
            li.textContent = 'No cities found. Try another name or country.';
            list.append(li);
        }
    }
    change.onclick = () => { search.value = ''; render(); dialog.showModal(); search.focus(); };
    search.oninput = render;
    search.onkeydown = event => { if (event.key === 'Escape') {
        event.preventDefault();
        dialog.close();
        return;
    } if (event.key === 'Enter') {
        const links = list.querySelectorAll('a');
        if (links.length === 1)
            links[0].click();
    } if (event.key === 'ArrowDown') {
        event.preventDefault();
        list.querySelector('a')?.focus();
    } };
    dialog.onclick = event => { if (event.target === dialog) {
        const box = dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)
            dialog.close();
    } };
    dialog.addEventListener('close', () => change.focus());
    return { city, cities };
}
export function describeWorldNetwork(world, network) {
    const help = document.querySelector('#help-dialog');
    const model = document.createElement('p');
    model.textContent = network.metadata.timeModel === 'estimated' ? 'Puzzle times are estimated from mapped distance, with four minutes per transfer.' : 'Times use a fixed daytime timetable, with four minutes per transfer.';
    help.append(model);
    const credits = document.createElement('p');
    credits.className = 'world-credits';
    const source = document.createElement('a');
    source.href = `/trainrot-world/sources/#${world.city.slug}`;
    source.textContent = 'Network data and timing';
    credits.append(source);
    help.append(credits);
    const note = document.createElement('div');
    note.className = 'world-map-note';
    const a = document.createElement('a');
    a.href = '/trainrot-world/sources/';
    a.textContent = network.metadata.mapName ? `${network.metadata.mapName} · Fictional network` : network.metadata.timeModel === 'estimated' ? 'Schematic map · Estimated puzzle times' : 'Schematic map · Scheduled puzzle times';
    note.append(a);
    if (network.metadata.attribution?.some(text => text.includes('OpenStreetMap'))) {
        const credit = document.createElement('a');
        credit.href = 'https://www.openstreetmap.org/copyright';
        credit.textContent = '© OpenStreetMap contributors';
        credit.target = '_blank';
        credit.rel = 'noopener';
        note.append(document.createTextNode(' '), credit);
    }
    document.querySelector('.map-panel').append(note);
    const first = help.querySelector('p');
    if (first)
        first.textContent = 'Find the fastest route from A to B.';
}
//# sourceMappingURL=world.js.map