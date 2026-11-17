// Screenshots of a map's page and its Study view: node dev/shoot.js <id> [id...]  (needs the dev server on 5221)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const id of process.argv.slice(2)) {
    for (const [name, vp] of [['phone', { width: 390, height: 800 }], ['desk', { width: 1200, height: 800 }]]) {
      const pg = await b.newPage({ viewport: vp });
      pg.on('pageerror', (e) => errs.push(id + ': ' + e.message));
      pg.on('console', (m) => { if (m.type() === 'error') errs.push(id + ' console: ' + m.text()); });
      await pg.goto('http://localhost:5221/#m/' + id);
      await pg.waitForSelector('#start', { timeout: 20000 });
      await pg.waitForTimeout(500);
      if (name === 'phone') await pg.screenshot({ path: `dev/shots/${id}-hub.png` });
      await pg.click('[data-mode="study"]');
      await pg.click('#start');
      await pg.waitForTimeout(1200);
      await pg.screenshot({ path: `dev/shots/${id}-study-${name}.png` });
      await pg.close();
    }
  }
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
