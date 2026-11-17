// node dev/shootdark.js <id>... : Study view screenshots in dark mode (dev server on 5221)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const id of process.argv.slice(2)) {
    const pg = await b.newPage({ viewport: { width: 390, height: 800 }, colorScheme: process.env.LIGHT ? 'light' : 'dark' });
    await pg.goto('http://localhost:5221/#m/' + id);
    await pg.waitForSelector('#start', { timeout: 20000 });
    await pg.click('[data-mode="study"]'); await pg.click('#start'); await pg.waitForTimeout(1500);
    if (process.env.ZOOM) { await pg.click('[data-z="in"]'); await pg.waitForTimeout(300); await pg.click('[data-z="in"]'); await pg.waitForTimeout(800); }
    await pg.screenshot({ path: `dev/shots/${id}-${process.env.LIGHT ? 'light' : 'dark'}${process.env.ZOOM ? '-z' : ''}.png` });
    await pg.close();
  }
  await b.close();
})();
