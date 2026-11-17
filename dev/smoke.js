// Smoke test: starts every game on each map given, pokes at it, and reports page errors.
// node dev/smoke.js <id> [id...]   (needs the dev server on 5221)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  let runs = 0, solved = 0;
  for (const id of process.argv.slice(2)) {
    const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
    pg.on('pageerror', (e) => errs.push(id + ': ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
    pg.on('console', (m) => { if (m.type() === 'error') errs.push(id + ' console: ' + m.text()); });
    await pg.goto('http://localhost:5221/#m/' + id);
    await pg.waitForSelector('#start', { timeout: 20000 });
    const modes = await pg.$$eval('[data-mode]', (els) => els.map((e) => e.dataset.mode));
    for (const mode of modes) for (const lvl of mode === 'study' ? [0] : [0, 3]) {
      await pg.goto('about:blank');
      await pg.goto('http://localhost:5221/#m/' + id);
      await pg.waitForSelector('#start');
      await pg.click(`[data-mode="${mode}"]`);
      if (mode !== 'study') await pg.click(`[data-lvl="${lvl}"]`);
      await pg.click('[data-scope="all"]');
      await pg.click('#start');
      await pg.waitForTimeout(1500);
      runs++;
      // Pinpoint: tap the place that is asked for, to check hits register on this kind of map
      if (mode === 'find' && lvl === 0) {
        for (let k = 0; k < 3; k++) {
          const pt = await pg.evaluate(() => {
            const name = (document.querySelector('.hud .prompt b') || {}).textContent;
            const i = GAME && GAME.pack.byName.get(name);
            if (i == null) return null;
            const el = document.querySelector('.game .mk circle[data-i="' + i + '"]') || document.querySelector('.game .hit path[data-i="' + i + '"]') || document.querySelector('.game .pl path[data-i="' + i + '"]');
            if (!el) return null;
            let x, y;
            if (el.tagName === 'path' && el.getTotalLength && getComputedStyle(el).fill === 'none') { const p = el.getPointAtLength(el.getTotalLength() * 0.5), m = el.getScreenCTM(); x = p.x * m.a + m.e; y = p.y * m.d + m.f; }
            else { const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
            return { x, y, name };
          });
          if (!pt) break;
          await pg.waitForTimeout(700);
          const again = await pg.evaluate((nm) => { const i = GAME.pack.byName.get(nm); const p = GAME.pack.places[i]; GAME.mv.focus(i); return true; }, pt.name);
          await pg.waitForTimeout(600);
          const pt2 = await pg.evaluate((nm) => {
            const i = GAME.pack.byName.get(nm);
            const el = document.querySelector('.game .mk circle[data-i="' + i + '"]') || document.querySelector('.game .hit path[data-i="' + i + '"]') || document.querySelector('.game .pl path[data-i="' + i + '"]');
            if (el.tagName === 'path' && getComputedStyle(el).fill === 'none') { const p = el.getPointAtLength(el.getTotalLength() * 0.5), m = el.getScreenCTM(); return { x: p.x * m.a + m.e, y: p.y * m.d + m.f }; }
            const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }, pt.name);
          const before = await pg.$eval('.hud .meter', (e) => e.textContent);
          await pg.mouse.click(pt2.x, pt2.y);
          await pg.waitForTimeout(900);
          const after = await pg.$eval('.hud .meter', (e) => e.textContent).catch(() => 'ended');
          if (after !== before) solved++; else errs.push(`${id} find: tap on ${pt.name} did not register (${before})`);
        }
      }
      // poke: taps around the map, any buttons in the panel, some typing
      const box = await pg.$eval('.game .host', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }).catch(() => null);
      if (box) for (let k = 0; k < 6; k++) { await pg.mouse.click(box.x + box.w * (0.2 + 0.6 * Math.random()), box.y + box.h * (0.2 + 0.6 * Math.random())); await pg.waitForTimeout(120); }
      const inp = await pg.$('.game .panel input');
      if (inp) { await inp.fill('mont'); await inp.press('Enter'); await pg.waitForTimeout(200); }
      for (const sel of ['[data-a="hint"]', '.choices button', '.tray .tile', '[data-a="skip"]', '[data-a="give"]']) { const el = await pg.$('.game ' + sel); if (el) { await el.click({ timeout: 800 }).catch(() => {}); await pg.waitForTimeout(250); } }
      if (process.env.SHOT) await pg.screenshot({ path: `dev/shots/${id}-${mode}-${lvl}.png` });
    }
    await pg.close();
  }
  console.log(runs + ' games started, ' + solved + ' Pinpoint answers registered');
  console.log(errs.length ? errs.length + ' problems:\n' + [...new Set(errs)].join('\n') : 'no problems');
  await b.close();
})();
