// End-to-end run against `wrangler dev` with a local D1 (ALLOW_NO_AUTH=true).
// Usage: node test/e2e.cjs [base url]
// Load the subjects into the local D1 too (pnpm subjects sql); the phase 1
// checks pick icons and set a landmark's intent. CHROME_PATH runs an
// installed Chrome instead of Playwright's own browser.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const errors = [], results = [];
const check = (name, ok, extra) => results.push((ok ? 'PASS ' : 'FAIL ') + name + (!ok && extra !== undefined ? ' :: ' + String(extra).replace(/\s+/g, ' ').slice(0, 600) : ''));
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', acceptDownloads: true });
  await ctx.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) errors.push('api ' + r.status() + ' ' + r.url()); });
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  const W = (ms = 400) => page.waitForTimeout(ms);
  const txt = async (sel) => ((await page.textContent(sel)) || '').replace(/\s+/g, ' ');
  const state = () => page.evaluate(() => fetch('/api/state', { cache: 'no-store' }).then((r) => r.json()));
  const saveBtn = '[data-act="mo-save"]:not([data-again])';

  await page.goto(BASE + '/#library');
  await W(800);
  check('page loads from D1', /Dark Age barracks/.test(await txt('#view')), await txt('#view'));
  check('flags load from assets', await page.evaluate(() => [...document.images].filter((i) => i.classList.contains('flag')).every((i) => i.complete && i.naturalWidth > 0)));

  // Element: tag two civs, note where it comes up
  await page.click('[data-act="df-open"][data-id="tower_rush"]');
  await page.click('[data-act="ms-open"][data-key="civOn"]');
  await page.check('.ms-list label.check:has-text("Rus") input');
  await page.check('.ms-list label.check:has-text("Scots") input');
  await page.click('[data-act="ms-open"][data-key="civOn"]');
  await page.click('[data-act="ms-open"][data-key="where"]');
  await page.check('.ms-list label.check:has-text("King of the Hill") input');
  await page.click('[data-act="ms-open"][data-key="where"]');
  await page.fill('#wh-note', 'Hill gold sits in the open');
  await page.click('[data-act="df-save"]');
  await W();
  let st = await state();
  const trTags = Object.values(st.tags).filter((t) => t.el === 'tower_rush' && t.active);
  const tr = st.defs.elements.find((e) => e.id === 'tower_rush');
  check('element tags saved to D1', ['rus', 'scots'].every((c) => trTags.some((t) => t.civ === c)), JSON.stringify(trTags));
  check('comes up on saved to D1', tr.where.some((p) => p.kind === 'map' && p.id === 'king-of-the-hill') && tr.whereNote === 'Hill gold sits in the open', JSON.stringify(tr));
  const changeIds = Object.keys(st.changes);
  check('change logged', changeIds.length === 1 && /Edited Tower rush/.test(st.changes[changeIds[0]].label), JSON.stringify(st.changes));

  // Undo from the toast removes them again
  await page.click('[data-act="toast-undo"]');
  await W();
  st = await state();
  check('undo restores D1', !Object.values(st.tags).some((t) => t.el === 'tower_rush' && t.active && (t.civ === 'rus' || t.civ === 'scots')) && !st.defs.elements.find((e) => e.id === 'tower_rush').where.length && Object.keys(st.changes).length === 0, JSON.stringify(Object.values(st.tags).filter((t) => t.el === 'tower_rush')));

  // New play in Library, tagged to a civ
  await page.click('[data-act="lib-seg"][data-v="strategies"]');
  await page.click('[data-act="df-new"][data-type="strategies"]');
  await page.fill('#df-name', 'Spear rush into towers');
  await page.click('[data-act="pb-pick"]');
  await page.click('[data-act="pb-add"][data-id="spear_rush"]');
  await page.click('[data-act="pb-age"][data-i="0"]');
  await page.click('[data-act="pb-pick"]');
  await page.click('[data-act="pb-add"][data-id="tower_rush"]');
  await page.click('[data-act="ms-open"][data-key="civOn"]');
  await page.check('.ms-list label.check:has-text("Ottomans") input');
  await page.click('[data-act="df-save"]');
  await W();
  st = await state();
  const sr = st.defs.strategies.find((s) => s.name === 'Spear rush into towers');
  check('new play with steps in D1', sr && sr.steps.length === 2 && sr.steps[0].age === 'dark' && sr.steps[1].age === 'dark', JSON.stringify(sr));
  check('play tag in D1', Object.values(st.tags).some((t) => t.play === (sr && sr.id) && t.civ === 'ottomans'));

  // Civ page: bulk tag for a feature, then edit one tag
  await page.goto(BASE + '/#civ-ottomans');
  await W(600);
  await page.click('[data-act="cv-bulk"]');
  await page.click('[data-act="pl-kind"][data-v="feature"]');
  await page.selectOption('#pl-id', 'exposed_close_gold');
  await page.check('#bk-offensive_walls');
  await page.click('[data-act="bk-save"]');
  await W();
  st = await state();
  const ow = Object.entries(st.tags).find(([, t]) => t.civ === 'ottomans' && t.el === 'offensive_walls' && t.place.kind === 'feature');
  check('feature tag in D1', !!ow, JSON.stringify(Object.values(st.tags).filter((t) => t.civ === 'ottomans')));
  await page.click(`[data-act="cv-tag"][data-id="${ow[0]}"]`);
  await page.fill('#tg-timing', 'Walls go up around the gold at 3 minutes');
  await page.click('[data-act="tg-save"]');
  await W();
  st = await state();
  check('tag edit in D1', /Walls go up/.test(st.tags[ow[0]].timing));

  // Maps: put a feature on two maps
  await page.goto(BASE + '/#maps');
  await W(500);
  await page.click('[data-act="maps-seg"][data-v="features"]');
  await page.click('[data-act="df-open"][data-id="exposed_close_gold"]');
  await page.click('[data-act="ms-open"][data-key="mapsOn"]');
  await page.check('.ms-list label.check:has-text("Dry Arabia") input');
  await page.click('[data-act="df-save"]');
  await W();
  st = await state();
  check('feature on map in D1', st.defs.maps.find((m) => m.id === 'dry-arabia').features.includes('exposed_close_gold'));

  // References: a guide with two moments
  await page.goto(BASE + '/#refs');
  await W(500);
  await page.fill('#rf-url', 'youtube.com/watch?v=abc123');
  await page.click('[data-act="rf-new"][data-kind="guide"]');
  await page.fill('#rd-title', 'Ottoman tower guide');
  await page.selectOption('#rd-civ', 'ottomans');
  await page.click('[data-act="rd-save"]');
  await W(700);
  check('on the guide page', /Ottoman tower guide/.test(await txt('h1')), await txt('h1'));
  await page.click('[data-act="mo-new"]');
  await page.click('[data-act="pb-add"][data-id="tower_rush"]');
  await page.click('[data-act="pb-age"][data-i="0"]');
  await page.fill('#mo-at', '1:30');
  await page.fill('#mo-note', 'Villagers walk out with stone');
  await page.click('[data-act="mo-save"][data-again="1"]');
  await W();
  await page.click('[data-act="pb-add"][data-id="dark_barracks"]');
  await page.click('[data-act="pb-pick"]');
  await page.click('[data-act="pb-add"][data-id="tower_rush"]');
  await page.fill('#mo-at', '3:05');
  await page.click(saveBtn);
  await W();
  st = await state();
  const guide = Object.entries(st.links).find(([, l]) => l.title === 'Ottoman tower guide');
  check('guide and moments in D1', guide && guide[1].kind === 'guide' && guide[1].civ === 'ottomans' && guide[1].url === 'https://youtube.com/watch?v=abc123' && guide[1].marks.length === 2 && guide[1].marks.some((m) => m.elementId === 'tower_rush' && m.age === 'dark' && m.at === 90) && guide[1].marks.some((m) => m.strategyId === 'barracks_into_tower_rush' && m.at === 185), JSON.stringify(guide));

  // My game with a Twitch VOD, one moment with how it went
  await page.goto(BASE + '/#refs');
  await W(500);
  await page.fill('#rf-url', 'https://www.twitch.tv/videos/123456');
  await page.click('[data-act="rf-new"][data-kind="mine"]');
  await page.selectOption('#rd-pciv', 'malians');
  await page.selectOption('#rd-ociv', 'ottomans');
  await page.selectOption('#rd-map', 'dry-arabia');
  await page.click('[data-act="rd-result"][data-v="loss"]');
  await page.click('[data-act="rd-save"]');
  await W(700);
  const route = await page.evaluate(() => location.hash);
  await page.click('[data-act="mo-new"]');
  await page.click('[data-act="pb-add"][data-id="tower_rush"]');
  await page.fill('#mo-at', '4:10');
  await page.click('[data-act="mo-how"]');
  await page.click('[data-act="mo-outcome"][data-v="worked"]');
  await page.click('[data-act="mo-prep"][data-v="saw_no_plan"]');
  await page.fill('#mo-did', 'Kept mining');
  await page.click(saveBtn);
  await W();
  st = await state();
  const gid = route.replace('#ref-game-', '');
  const game = st.games[gid];
  const vod = Object.values(st.links).find((l) => l.gameId === gid);
  check('game and its moment in D1', game && game.mine && game.plays.length === 1 && game.plays[0].elementId === 'tower_rush' && game.plays[0].prep === 'saw_no_plan' && game.plays[0].did === 'Kept mining', JSON.stringify(game));
  check('timestamp on the VOD in D1', vod && vod.kind === 'game' && vod.marks.length === 1 && vod.marks[0].at === 250 && vod.marks[0].playId === game.plays[0].pid, JSON.stringify(vod));

  // Delete the moment, then undo: the play and its timestamp come back
  await page.click('[data-act="mo-open"]');
  await page.click('[data-act="mo-delete"]');
  await W();
  st = await state();
  check('moment deleted in D1', st.games[gid].plays.length === 0 && Object.values(st.links).find((l) => l.gameId === gid).marks.length === 0);
  await page.click('[data-act="toast-undo"]');
  await W();
  st = await state();
  check('undo brings back play and timestamp', st.games[gid].plays.length === 1 && Object.values(st.links).find((l) => l.gameId === gid).marks.length === 1 && Object.values(st.links).find((l) => l.gameId === gid).marks[0].playId === st.games[gid].plays[0].pid, JSON.stringify(st.games[gid]));

  // Delete the whole reference, then undo
  await page.click('[data-act="rf-edit"]');
  await page.click('[data-act="rd-secondary"]');
  await W(700);
  st = await state();
  check('reference deleted in D1', !st.games[gid] && !Object.values(st.links).some((l) => l.gameId === gid));
  await page.click('[data-act="toast-undo"]');
  await W();
  st = await state();
  check('undo restores the reference in D1', !!st.games[gid] && st.games[gid].plays.length === 1 && Object.values(st.links).some((l) => l.gameId === gid && l.marks.length === 1));

  // Undo of a new play created from a moment removes the play again
  await page.goto(BASE + '/' + route);
  await W(600);
  await page.click('[data-act="mo-new"]');
  await page.click('[data-act="pb-add"][data-id="second_tc"]');
  await page.click('[data-act="pb-pick"]');
  await page.click('[data-act="pb-add"][data-id="fortress_boom"]');
  await page.click('[data-act="pb-pick"]');
  await page.click('[data-act="pb-add"][data-id="maa_spam"]');
  await page.fill('#mo-name', 'Boom into men-at-arms');
  await page.click(saveBtn);
  await W();
  st = await state();
  check('new play from a moment in D1', st.defs.strategies.some((s) => s.name === 'Boom into men-at-arms'));
  await page.click('[data-act="toast-undo"]');
  await W();
  st = await state();
  check('undo removes that play from D1', !st.defs.strategies.some((s) => s.name === 'Boom into men-at-arms') && st.games[gid].plays.length === 1, st.defs.strategies.map((s) => s.name).join(', '));

  // Check sees the guide, the game, the tags
  await page.goto(BASE + '/#check');
  await W(600);
  await page.selectOption('#ck-me', 'malians');
  await page.selectOption('#ck-opp', 'ottomans');
  await page.selectOption('#ck-place', 'map:dry-arabia');
  await page.click('[data-act="ck-seg"][data-v="elements"]');
  const v = await txt('#view');
  check('Check uses D1 tags', /Offensive walls\s*Tagged on maps with exposed close gold/.test(v), v);
  await page.click('[data-act="ck-open"][data-id="tower_rush"]');
  const why = await txt('#sheet');
  check('Check detail uses D1 references', /Shown in a guide: Ottoman tower guide, at 1:30/.test(why) && /Seen in your game on Dry Arabia, November \d+, at 4:10/.test(why) && /Watch from 4:10/.test(why), why);
  const watch = await page.$$eval('#sheet a[target="_blank"]', (as) => as.map((a) => a.href));
  check('watch links open at the time', watch.some((h) => /twitch\.tv\/videos\/123456\?t=0h4m10s/.test(h)) && watch.some((h) => /t=90s/.test(h)), JSON.stringify(watch));
  await page.click('.close');

  // Fresh load reads everything back from D1
  await page.reload();
  await W(900);
  await page.goto(BASE + '/#refs');
  await W(500);
  check('fresh load shows references', (await page.$$('#view .lrow')).length === 10, (await page.$$('#view .lrow')).length);

  // Merge duplicates through Upkeep: make a duplicate by renaming steps
  await page.goto(BASE + '/#library');
  await W(500);
  await page.click('[data-act="upkeep"]');
  const up = await txt('#sheet');
  check('upkeep lists D1 changes', /Recent changes/.test(up) && /Added Tower rush to Ottoman tower guide|Added Barracks/.test(up), up);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="up-export"]')]);
  check('download works', /matchup-library-.*\.json/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await page.click('.close');

  // Phase 1: type, icon and intent on an element, universal elements, landmarks
  await page.goto(BASE + '/#library');
  await W(500);
  await page.click('[data-act="lib-seg"][data-v="elements"]');
  await page.click('[data-act="df-open"][data-id="tower_rush"]');
  await page.click('[data-act="df-type"][data-v="structure"]');
  await page.click('[data-act="df-subject-pick"]');
  await page.fill('#df-subject-q', 'outpost');
  await page.click('[data-act="df-subject"][data-id="outpost"]');
  await page.click('[data-act="df-intent"][data-v="offensive"]');
  await page.click('[data-act="df-save"]');
  await W();
  st = await state();
  const tr2 = st.defs.elements.find((e) => e.id === 'tower_rush');
  check('element type, icon and intent in D1', tr2.kind === 'structure' && tr2.subject === 'outpost' && tr2.intent === 'offensive', JSON.stringify(tr2));
  await page.click('[data-act="lib-back"]').catch(() => {});
  await W(200);
  check('split pill shows type, intent and icon', await page.$eval('[data-act="df-open"][data-id="tower_rush"] .spill',
    (el) => el.dataset.type === 'structure' && el.dataset.intent === 'offensive' && !!el.querySelector('img[src$="outpost-1.png"]')));
  await page.click('[data-act="df-open"][data-id="tower_rush"]');
  await page.check('#df-universal');
  await page.click('[data-act="ms-open"][data-key="cannot"]');
  await page.check('.ms-list label.check:has-text("Mongols") input');
  await page.click('[data-act="ms-open"][data-key="cannot"]');
  await page.click('[data-act="df-save"]');
  await W();
  st = await state();
  const tr3 = st.defs.elements.find((e) => e.id === 'tower_rush');
  check('universal element and its exception in D1', tr3.universal === true && (tr3.cannot || []).join() === 'mongols', JSON.stringify(tr3));
  await page.fill('#df-name', 'Tower rush, edited');
  await page.click('[data-act="lib-back"]').catch(() => {});
  await page.click('[data-act="df-open"][data-id="offensive_walls"]').catch(() => {});
  await W(200);
  check('unsaved edits are not dropped', (await page.inputValue('#df-name')) === 'Tower rush, edited');
  await page.click('[data-act="df-revert"]');
  await W(200);
  await page.click('[data-act="lib-seg"][data-v="landmarks"]');
  await page.selectOption('#lm-civ', 'holy_roman_empire');
  await page.click('[data-act="lm-intent"][data-id="burgrave-palace"][data-v="offensive"]');
  await W();
  st = await state();
  check('landmark default intent in D1', st.subjects['burgrave-palace'] && st.subjects['burgrave-palace'].defaultIntent === 'offensive', JSON.stringify(st.subjects['burgrave-palace']));
  await page.click('[data-act="lib-seg"][data-v="strategies"]');
  await page.click('[data-act="df-open"][data-id="barracks_into_tower_rush"]');
  await page.click('[data-act="pb-intent"][data-i="1"]');
  await page.click('[data-act="pb-intent"][data-i="1"]');
  await page.click('[data-act="df-save"]');
  await W();
  st = await state();
  const bt = st.defs.strategies.find((x) => x.id === 'barracks_into_tower_rush');
  check('play step intent in D1', bt && bt.steps.some((x) => x.el === 'tower_rush' && x.intent === 'defensive'), JSON.stringify(bt));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('[data-act="lib-seg"][data-v="elements"]');
  await page.click('[data-act="df-open"][data-id="spear_rush"]');
  await W(200);
  const panes = await page.$$eval('.lib > .pane', (ps) => ps.map((x) => x.getBoundingClientRect().width > 200));
  check('three panes side by side on a wide screen', panes.length === 3 && panes.every(Boolean), JSON.stringify(panes));
  await page.setViewportSize({ width: 390, height: 844 });

  // Overflow and console
  for (const vw of ['library', 'civs', 'maps', 'refs', 'check', 'civ-ottomans']) {
    await page.goto(BASE + '/#' + vw);
    await W(300);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('no horizontal overflow on ' + vw, ov <= 0, ov);
  }
  await page.screenshot({ path: 'test/last-run.png' });
  console.log(results.join('\n'));
  console.log('FAILS:', results.filter((r) => r.startsWith('FAIL')).length, '/', results.length);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.log('CRASH', e.message.slice(0, 800)); console.log('ERRORS:', errors.join('\n')); process.exit(1); });
