// Normalise a person's name to Title Case for consistent storage/display.
// Only re-cases words that are entirely upper- or lower-case, so intentional
// mixed-case names (McDonald, O'Brien-style) are left untouched.
function fixWord(word) {
    if (!word)
        return word;
    const isUniform = word === word.toUpperCase() || word === word.toLowerCase();
    if (!isUniform)
        return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
export function titleCaseName(name) {
    return name
        .split(/(\s+)/)
        .map(part => (/\s+/.test(part) ? part : part.split('-').map(fixWord).join('-')))
        .join('')
        .trim();
}
