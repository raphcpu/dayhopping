// Nach "expo export -p web": Pfade für GitHub Pages einsetzen und 404.html anlegen,
// damit direkte Links wie /dayhopping/round/… in der App landen statt bei GitHubs Fehlerseite.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const base = process.env.EXPO_PUBLIC_BASE_PATH || '/';
const file = 'dist/index.html';
writeFileSync(file, readFileSync(file, 'utf8').replaceAll('%BASE%', base));
copyFileSync(file, 'dist/404.html');
writeFileSync('dist/.nojekyll', '');
console.log(`Web-Build für ${base} vorbereitet`);
