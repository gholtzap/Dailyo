// Names people use when they do not know the atlas's display name.
const aliases = {
    CD: [
        "DRC",
        "D.R.C.",
        "Democratic Republic of the Congo",
        "Congo Kinshasa",
        "Zaire",
    ],
    CG: ["Congo Brazzaville"],
    GB: ["UK", "U.K.", "United Kingdom", "Britain", "Great Britain"],
    US: ["USA", "U.S.A.", "U.S.", "United States", "America"],
    CZ: ["Czechia", "Czech Republic"],
    CI: ["Ivory Coast", "Cote d Ivoire"],
    TR: ["Turkey", "Turkiye"],
    MM: ["Burma"],
    SZ: ["Swaziland", "Eswatini"],
    MK: ["Macedonia", "North Macedonia"],
    TL: ["East Timor", "Timor Leste"],
    VA: ["Vatican", "Vatican City", "Holy See"],
    KR: ["South Korea", "Republic of Korea"],
    KP: ["North Korea"],
    RU: ["Russia", "Russian Federation"],
    LA: ["Laos", "Lao PDR"],
    VN: ["Vietnam", "Viet Nam"],
    IR: ["Iran"],
    SY: ["Syria"],
    TZ: ["Tanzania"],
    BO: ["Bolivia"],
    VE: ["Venezuela"],
    BN: ["Brunei"],
    TW: ["Taiwan"],
};
const normalize = (value) => value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
const names = (country) => [country.name, country.id, ...(aliases[country.id] ?? [])].map(normalize);
// A complete name can commit immediately unless it is part of another country's
// name (Guinea / Equatorial Guinea). Check the whole atlas, including selections.
export function automaticCountryMatch(countries, query) {
    const normalized = normalize(query);
    if (!normalized)
        return;
    const labels = (country) => [country.name, ...(aliases[country.id] ?? [])].map(normalize);
    const exact = countries.filter((country) => labels(country).includes(normalized));
    if (exact.length !== 1)
        return;
    if (countries.some((country) => country.id !== exact[0].id &&
        labels(country).some((name) => name.includes(normalized))))
        return;
    return exact[0];
}
export function exactCountryMatch(country, query) {
    const normalized = normalize(query);
    return Boolean(normalized) && names(country).includes(normalized);
}
export function searchCountries(countries, query, limit = 6) {
    const normalized = normalize(query);
    if (!normalized)
        return [];
    const tokens = normalized.split(" ");
    const rank = (country) => {
        const candidates = names(country);
        if (candidates.includes(normalized))
            return 0;
        if (candidates.some((name) => name.startsWith(normalized)))
            return 1;
        if (candidates.some((name) => name.includes(normalized) ||
            tokens.every((token) => name.split(" ").some((word) => word.startsWith(token)))))
            return 2;
        return 3;
    };
    return countries
        .map((country) => ({ country, rank: rank(country) }))
        .filter((match) => match.rank < 3)
        .sort((a, b) => a.rank - b.rank || a.country.name.localeCompare(b.country.name))
        .slice(0, limit)
        .map(({ country }) => country);
}
//# sourceMappingURL=country-search.js.map