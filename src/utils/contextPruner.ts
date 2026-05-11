export function parseRequirementsRefs(requirementsLine: string): string[] {
    const match = requirementsLine.match(/_Requirements:\s*([^_]+)_/);
    if (!match) return [];
    return match[1].split(',').map(r => r.trim()).filter(Boolean);
}

export function pruneRequirements(content: string, refs: string[]): string {
    if (refs.length === 0) return content;

    const refSet = new Set(refs);
    const lines = content.split('\n');
    const collected: string[] = [];
    let capturing = false;

    for (const line of lines) {
        const subsectionMatch = line.match(/^### (\d+\.\d+)/);
        const sectionMatch = !subsectionMatch && /^#{1,2} /.test(line);

        if (subsectionMatch) {
            capturing = refSet.has(subsectionMatch[1]);
            if (capturing) collected.push(line);
        } else if (sectionMatch) {
            capturing = false;
        } else if (capturing) {
            collected.push(line);
        }
    }

    if (collected.length === 0) return content;

    // trim trailing blank lines
    while (collected.length > 0 && collected[collected.length - 1].trim() === '') {
        collected.pop();
    }

    return collected.join('\n');
}
