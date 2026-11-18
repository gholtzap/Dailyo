export const practiceDifficulties = ['easy', 'standard', 'hard'];
export const parseDifficulty = (value) => practiceDifficulties.some(level => level === value) ? value : 'standard';
export const practiceSlot = (difficulty) => difficulty === 'standard' ? 'practice' : `practice:${difficulty}`;
export function practiceSettings(descriptions, change) {
    const panel = document.createElement('div');
    panel.className = 'practice-settings';
    panel.hidden = true;
    const row = document.createElement('div');
    row.className = 'practice-settings-row';
    const label = document.createElement('label');
    label.htmlFor = 'practice-difficulty';
    label.textContent = 'Difficulty';
    const select = document.createElement('select');
    select.id = label.htmlFor;
    select.setAttribute('aria-describedby', 'practice-difficulty-description');
    for (const level of practiceDifficulties) {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = level[0].toUpperCase() + level.slice(1);
        select.append(option);
    }
    const description = document.createElement('p');
    description.id = 'practice-difficulty-description';
    description.setAttribute('role', 'status');
    row.append(label, select);
    panel.append(row, description);
    select.onchange = () => change(parseDifficulty(select.value));
    return { element: panel, sync(level, visible) {
            panel.hidden = !visible;
            select.value = level;
            description.textContent = descriptions[level];
        } };
}
//# sourceMappingURL=difficulty.js.map