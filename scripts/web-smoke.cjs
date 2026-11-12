// CI: öffnet die Browser-Version wie ein iPhone, prüft auf Fehler und legt Bildschirmfotos ab.
const { chromium, devices } = require('playwright');

const base = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 53.5511, longitude: 9.9937 }, permissions: ['geolocation'] });
  let failed = false;
  for (const [name, path] of [['start', ''], ['kartentest', 'kartentest']]) {
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => {
      logs.push(`PAGEERROR: ${e.message}`);
      failed = true;
    });
    await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => logs.push('GOTO: ' + e.message));
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `web-${name}.png` });
    console.log(`--- ${name}: ${(await page.innerText('body').catch(() => '')).slice(0, 300).replace(/\n+/g, ' | ')}`);
    for (const l of logs) console.log('  ' + l.slice(0, 400));
    await page.close();
  }
  await browser.close();
  console.log(failed ? 'WEBTEST: FEHLER' : 'WEBTEST: OK');
  process.exit(failed ? 1 : 0);
})();
