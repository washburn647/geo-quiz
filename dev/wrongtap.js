// Pinpoint on a road map: tap a wrong road and screenshot while it flashes.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const id = process.argv[2] || 'us-vt-roads';
  const pg = await b.newPage({ viewport: { width: 390, height: 800 }, colorScheme: process.env.DARK ? 'dark' : 'light' });
  await pg.goto('http://localhost:5221/#m/' + id);
  await pg.waitForSelector('#start');
  await pg.click('[data-mode="find"]'); await pg.click('[data-lvl="2"]'); await pg.click('[data-scope="all"]'); await pg.click('#start');
  await pg.waitForTimeout(1500);
  const pt = await pg.evaluate(() => {
    const name = document.querySelector('.hud .prompt b').textContent;
    const want = GAME.pack.byName.get(name);
    const els = Array.from(document.querySelectorAll('.game .hit path')).filter((e) => +e.dataset.i !== want);
    let best = null;
    for (const el of els) { const r = el.getBoundingClientRect(); if (r.width > 120 && r.top > 80 && r.bottom < 650) { best = el; break; } }
    const p = best.getPointAtLength(best.getTotalLength() * 0.5), m = best.getScreenCTM();
    return { x: p.x * m.a + m.e, y: p.y * m.d + m.f, n: GAME.pack.places[+best.dataset.i].n };
  });
  await pg.mouse.click(pt.x, pt.y);
  await pg.waitForTimeout(120);
  await pg.screenshot({ path: `dev/shots/${id}-wrongtap.png` });
  console.log('tapped', pt.n);
  await b.close();
})();
