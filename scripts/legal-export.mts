// Schreibt docs/datenschutz.md aus src/lib/legal.ts: npm run legal:export
import fs from 'node:fs';
import { LEGAL_VERSION, operatorComplete, privacySections, rulesSections } from '../src/lib/legal.ts';

const render = (sections: { title: string; paragraphs: string[] }[]) =>
  sections.map((s) => `## ${s.title}\n\n${s.paragraphs.join('\n\n')}`).join('\n\n');

const md = `# Datenschutzerklärung für DayHop

${LEGAL_VERSION}
${operatorComplete ? '' : '\n> **Entwurf.** Die Angaben zum Betreiber fehlen noch (EXPO_PUBLIC_LEGAL_* in .env). Der Text beschreibt, was die App technisch tut, und ersetzt keine rechtliche Prüfung.\n'}
${render(privacySections())}

${render(rulesSections())}
`;
fs.mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../docs/datenschutz.md', import.meta.url), md);
console.log('docs/datenschutz.md geschrieben');
