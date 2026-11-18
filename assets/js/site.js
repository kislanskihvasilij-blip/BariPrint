// BariPrint site script: intro, reveal, liquid buttons, glass drop, menus, contact sheet, tabs, odometer,
// map, cookies + Metrika, requisites copy, policy TOC, lightbox. No dependencies. Paired with site.css.
(() => {
  const html = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const mq = (q) => matchMedia(q).matches;
  const reduce = mq('(prefers-reduced-motion: reduce)');
  const canHover = mq('(hover: hover)');
  const store = (k, v) => {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* storage blocked */ }
    return null;
  };

  /* ---------- intro: words in a mask, brand counted letter by letter, curtain up (ported from fx/bp-fx.js) ---------- */
  const BRAND = 'БариПринт';
  const ACCENT_FROM = 4; // "Принт" in brand blue
  const ABC = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
  const WORDS = ['Печать', 'Реклама', 'Производство'];
  const INTRO_MS = 2300;
  const TICKS = 18;

  // like 21tsi's 0 -> 21 counter: every letter counts up the alphabet from А to its own letter, all landing together
  function countBrand(head, tail) {
    const targets = [...BRAND].map((ch) => ABC.indexOf(ch.toLowerCase()));
    const render = (p) => {
      const word = [...BRAND].map((ch, i) => {
        const c = ABC[Math.round(targets[i] * p)];
        return ch === ch.toUpperCase() ? c.toUpperCase() : c;
      }).join('');
      head.textContent = word.slice(0, ACCENT_FROM);
      tail.textContent = word.slice(ACCENT_FROM);
    };
    render(0);
    let k = 0;
    const tick = () => {
      k += 1;
      render(1 - (1 - k / TICKS) ** 2); // fast start, slowing down like the counter
      if (k < TICKS) setTimeout(tick, 40 + 110 * (k / TICKS) ** 2);
    };
    setTimeout(tick, 300);
  }

  function intro(done) {
    if (!html.classList.contains('bp-intro')) return done(false);
    const el = document.createElement('div');
    el.className = 'bp-intro-el';
    el.setAttribute('aria-hidden', 'true');
    const words = document.createElement('div');
    words.className = 'bp-intro__words';
    WORDS.forEach((w) => words.appendChild(Object.assign(document.createElement('span'), { textContent: w })));
    const brand = document.createElement('div');
    brand.className = 'bp-intro__brand';
    const head = document.createElement('span');
    const tail = Object.assign(document.createElement('span'), { className: 'is-accent' });
    brand.append(head, tail);
    el.append(words, brand);
    document.body.appendChild(el);
    html.classList.add('hero-wait');
    html.classList.remove('bp-intro');
    countBrand(head, tail);
    let finished = false;
    const SKIP = ['keydown', 'pointerdown', 'wheel', 'touchstart'];
    const finish = () => {
      if (finished) return;
      finished = true;
      SKIP.forEach((t) => removeEventListener(t, finish, true));
      el.classList.add('is-out');
      html.classList.replace('hero-wait', 'hero-go');
      done(true);
      setTimeout(() => el.remove(), 1000);
    };
    SKIP.forEach((t) => addEventListener(t, finish, { capture: true, passive: true }));
    setTimeout(() => el.classList.add('is-run'), 30); // not rAF: it stalls in background tabs and the intro would skip
    setTimeout(finish, INTRO_MS);
  }

  /* ---------- scroll reveal: rise + fade + light blur, staggered; failsafe never leaves content hidden ---------- */
  const RV = '.sec__head, .svc__list, .svc__foot, .nums__list > li, .prices__main, .bento > li, .dir, .proj > li, .proj__more, '
    + '.rail, .process__panels, .rev__panels, .rev__tabs, .faq__list, .find, .clients ul, .cta__sheet, .card, .req, .opt, .masonry > li, .grid2 > figure, .dl > div';
  function reveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    const els = $$(RV).filter((e) => !e.closest('.hero'));
    let batch = 0;
    let batchTimer = 0;
    const play = (e) => {
      if (!e.classList.contains('bp-rv')) return;
      e.style.transitionDelay = `${Math.min(batch++, 6) * 90}ms`;
      clearTimeout(batchTimer);
      batchTimer = setTimeout(() => { batch = 0; }, 60);
      e.classList.add('bp-rv--in');
      setTimeout(() => { e.classList.remove('bp-rv', 'bp-rv--in'); e.style.transitionDelay = ''; }, 1800);
    };
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      play(en.target);
    }), { rootMargin: '0px 0px -8% 0px' });
    const vh = innerHeight;
    els.forEach((e) => {
      if (e.getBoundingClientRect().top < vh) return; // already on screen: don't flash it
      e.classList.add('bp-rv');
      io.observe(e);
    });
    const showAll = (all) => $$('.bp-rv').forEach((e) => {
      if (all || e.getBoundingClientRect().top < innerHeight) { io.unobserve(e); play(e); }
    });
    // failsafe from 4s on: anything on or above the screen is shown even if the observer stalls (throttled/background tab)
    setTimeout(() => {
      showAll(false);
      const t = setInterval(() => { if (document.querySelector('.bp-rv:not(.bp-rv--in)')) showAll(false); else clearInterval(t); }, 1500);
    }, 4000);
    addEventListener('beforeprint', () => showAll(true));
  }

  /* ---------- liquid buttons: cursor shine (hover devices), ripple from the tap point, springy press ---------- */
  function layer(btn) {
    let fx = btn.querySelector(':scope > .bp-btnfx');
    if (fx) return fx;
    fx = document.createElement('span');
    fx.className = 'bp-btnfx';
    fx.setAttribute('aria-hidden', 'true');
    btn.appendChild(fx);
    return fx;
  }
  function buttons() {
    const find = (e) => e.target.closest && e.target.closest('.btn');
    if (canHover) {
      document.addEventListener('pointerover', (e) => { const b = find(e); if (b) layer(b); }, { passive: true });
      let pend = null; // one layout read + write per frame, however many pointermove events arrive
      document.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const b = find(e);
        if (!b) return;
        if (!pend) {
          requestAnimationFrame(() => {
            const { el, x, y } = pend;
            pend = null;
            const r = el.getBoundingClientRect();
            el.style.setProperty('--bp-x', `${x - r.left}px`);
            el.style.setProperty('--bp-y', `${y - r.top}px`);
          });
        }
        pend = { el: b, x: e.clientX, y: e.clientY };
      }, { passive: true });
    }
    if (reduce) return;
    document.addEventListener('pointerdown', (e) => {
      const b = find(e);
      if (!b) return;
      const r = b.getBoundingClientRect();
      const d = Math.hypot(r.width, r.height) * 2;
      const drop = document.createElement('i');
      Object.assign(drop.style, { left: `${e.clientX - r.left - d / 2}px`, top: `${e.clientY - r.top - d / 2}px`, width: `${d}px`, height: `${d}px` });
      layer(b).appendChild(drop);
      drop.addEventListener('animationend', () => drop.remove());
      b.classList.remove('bp-pop');
      void b.offsetWidth; // restart the press animation on rapid taps
      b.classList.add('bp-pop');
    }, { passive: true });
    document.addEventListener('animationend', (e) => {
      if (e.animationName === 'bpPop') e.target.classList.remove('bp-pop');
    });
  }

  /* ---------- glass drop: springs to the hovered/focused item, rests on the current one (physics from fx/bp-fx.js) ---------- */
  function liquidDrop(box, items, current) {
    if (!items.length) return null;
    const drop = document.createElement('span');
    drop.className = 'bp-drop';
    drop.setAttribute('aria-hidden', 'true');
    box.prepend(drop);
    const L = { x: 0, v: 0 }; const R = { x: 0, v: 0 }; const tgt = { l: 0, r: 0, y: 0, h: 0 };
    let raf = 0; let last = 0; let ready = false; let restTimer = 0;
    const STEP = 1 / 120;
    const step = () => {
      const goingRight = tgt.l > L.x;
      [[L, tgt.l, !goingRight], [R, tgt.r, goingRight]].forEach(([b, t, lead]) => {
        const k = lead ? 320 : 150; const c = lead ? 34 : 22; // leading edge snaps, trailing edge lags: the drop stretches
        b.v += (k * (t - b.x) - c * b.v) * STEP;
        b.x += b.v * STEP;
      });
    };
    const paint = (squash) => {
      drop.style.width = `${Math.max(R.x - L.x, 8)}px`;
      drop.style.height = `${tgt.h}px`;
      drop.style.transform = `translate(${L.x}px, ${tgt.y}px) scaleY(${squash})`;
    };
    const tick = (now) => {
      // integrate real elapsed time in fixed substeps, so slow or dropped frames don't make the drop crawl
      const dt = Math.min((now - (last || now - 16)) / 1000, 0.25);
      last = now;
      for (let t = 0; t < dt; t += STEP) step();
      paint(1 - Math.min(Math.abs(L.v + R.v) / 6000, 0.18));
      const moving = Math.abs(L.v) + Math.abs(R.v) > 2 || Math.abs(tgt.l - L.x) + Math.abs(tgt.r - R.x) > 0.5;
      raf = moving ? requestAnimationFrame(tick) : 0;
      if (!raf) last = 0;
    };
    // map screen px to the drop's own px by nudging it 100px and measuring (survives zoom/transforms)
    const calibrate = () => {
      const keep = drop.style.transform;
      drop.style.transform = 'translate(0px, 0px)';
      const a0 = drop.getBoundingClientRect();
      drop.style.transform = 'translate(100px, 100px)';
      const a1 = drop.getBoundingClientRect();
      drop.style.transform = keep;
      return { ox: a0.left, oy: a0.top, sx: (a1.left - a0.left) / 100 || 1, sy: (a1.top - a0.top) / 100 || 1 };
    };
    const aim = (a, snap) => {
      const { ox, oy, sx, sy } = calibrate();
      const r = a.getBoundingClientRect();
      tgt.l = (r.left - ox) / sx;
      tgt.r = (r.right - ox) / sx;
      tgt.h = r.height / sy;
      tgt.y = (r.top - oy) / sy;
      clearTimeout(restTimer);
      drop.classList.add('is-on');
      if (!ready || snap || reduce) {
        L.x = tgt.l; R.x = tgt.r; L.v = 0; R.v = 0; ready = true;
        paint(1);
        return;
      }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const rest = (snap) => {
      const c = current();
      if (c && c.offsetParent) aim(c, snap);
      else { drop.classList.remove('is-on'); ready = false; }
    };
    items.forEach((a) => {
      if (canHover) a.addEventListener('pointerenter', () => aim(a));
      a.addEventListener('focus', () => { if (a.matches(':focus-visible')) aim(a); });
    });
    box.addEventListener('pointerleave', () => { restTimer = setTimeout(() => rest(), 220); });
    box.addEventListener('focusout', (e) => { if (!box.contains(e.relatedTarget)) rest(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => rest(true)).observe(box);
    if (document.fonts) document.fonts.ready.then(() => rest(true));
    rest(true);
    return { rest };
  }

  /* ---------- tabs (prices, process, reviews): roles in HTML, arrow keys, roving tabindex ---------- */
  function tabs() {
    $$('[role="tablist"]').forEach((list) => {
      const all = $$('[role="tab"]', list);
      const vertical = list.getAttribute('aria-orientation') === 'vertical';
      const sel = () => all.find((t) => t.getAttribute('aria-selected') === 'true');
      const select = (t, focus) => {
        all.forEach((x) => {
          const on = x === t;
          x.setAttribute('aria-selected', String(on));
          x.tabIndex = on ? 0 : -1;
          const p = document.getElementById(x.getAttribute('aria-controls'));
          if (p) p.classList.toggle('is-on', on);
        });
        if (focus) t.focus();
        if (list.bpDrop) list.bpDrop.rest();
      };
      all.forEach((t) => { t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1; });
      list.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) select(t); });
      list.addEventListener('keydown', (e) => {
        const i = all.indexOf(e.target);
        if (i < 0) return;
        const next = { [vertical ? 'ArrowDown' : 'ArrowRight']: i + 1, [vertical ? 'ArrowUp' : 'ArrowLeft']: i - 1, Home: 0, End: all.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        select(all[(next + all.length) % all.length], true);
      });
      if (list.hasAttribute('data-drop')) {
        list.bpDrop = liquidDrop(list, all, sel);
      }
    });
  }

  /* ---------- header: nav drop, «Клиентам» disclosure, mobile menu ---------- */
  function header() {
    const nav = $('.nav[data-drop]');
    if (nav) liquidDrop(nav, $$('.nav__a', nav), () => $('.nav__a[aria-current="page"]', nav));
    const btn = $('.nav__sub > button');
    const sub = btn && document.getElementById(btn.getAttribute('aria-controls'));
    if (sub) {
      const wrap = btn.parentElement;
      let t = 0;
      const set = (open) => { clearTimeout(t); btn.setAttribute('aria-expanded', String(open)); sub.classList.toggle('is-open', open); };
      // a mouse click right after the hover-open must not close it; keyboard/touch still toggle
      btn.addEventListener('click', (e) => set((canHover && e.pointerType === 'mouse') || btn.getAttribute('aria-expanded') !== 'true'));
      if (canHover) {
        wrap.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') set(true); });
        wrap.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') t = setTimeout(() => set(false), 250); });
      }
      wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sub.classList.contains('is-open')) { set(false); btn.focus(); } });
      wrap.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget)) set(false); });
      document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) set(false); });
    }
    const mm = $('#mmenu');
    const burger = $('.hdr__burger');
    if (mm && burger && mm.showModal) {
      let viaLink = false;
      burger.addEventListener('click', () => { viaLink = false; mm.showModal(); burger.setAttribute('aria-expanded', 'true'); });
      mm.addEventListener('close', () => {
        burger.setAttribute('aria-expanded', 'false');
        if (!viaLink) burger.focus({ preventScroll: true }); // a tapped link moves on; don't yank focus/scroll back
      });
      $('.mmenu__close', mm).addEventListener('click', () => mm.close());
      mm.addEventListener('click', (e) => { if (e.target.closest('a')) { viaLink = true; mm.close(); } });
      matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches && mm.open) mm.close(); });
    }
  }

  /* ---------- contact sheet: Popover API, <dialog> fallback, anchored on desktop, bottom sheet on phones ---------- */
  function contactSheet() {
    const sheet = $('#contact');
    if (!sheet) return;
    const hasPopover = typeof sheet.showPopover === 'function';
    let invoker = null;
    const place = () => {
      if (!invoker || innerWidth < 640 || invoker.closest('dialog')) {
        sheet.removeAttribute('data-anchored');
        sheet.style.left = ''; sheet.style.top = '';
        return;
      }
      const r = invoker.getBoundingClientRect();
      const w = Math.min(340, innerWidth - 24);
      const h = sheet.offsetHeight || 380;
      const left = Math.min(Math.max(12, r.right - w), innerWidth - w - 12);
      const below = r.bottom + 10;
      const top = below + h > innerHeight - 12 ? Math.max(12, r.top - 10 - h) : below;
      sheet.setAttribute('data-anchored', '');
      sheet.style.left = `${left}px`;
      sheet.style.top = `${top}px`;
    };
    const opened = () => { place(); const first = $('.sheet__row', sheet); if (first) first.focus(); };
    const restore = () => {
      if (invoker && invoker.isConnected && (document.activeElement === document.body || sheet.contains(document.activeElement))) invoker.focus();
    };
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[popovertarget="contact"]');
      if (!b) return;
      invoker = b;
      if (!hasPopover) { e.preventDefault(); if (sheet.open) sheet.close(); else { sheet.showModal(); opened(); } }
    });
    if (hasPopover) {
      sheet.addEventListener('beforetoggle', (e) => { if (e.newState === 'open') place(); });
      sheet.addEventListener('toggle', (e) => { if (e.newState === 'open') opened(); else restore(); });
    } else {
      sheet.addEventListener('close', restore);
      sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
    }
    $('[data-sheet-close]', sheet).addEventListener('click', () => (hasPopover ? sheet.hidePopover() : sheet.close()));
    addEventListener('resize', () => { if (hasPopover ? sheet.matches(':popover-open') : sheet.open) place(); });
  }

  /* ---------- services: hover/focus swaps the sticky preview with a bottom-up wipe ---------- */
  function services() {
    const win = $('.svc__win');
    if (!win) return;
    const imgs = $$('img', win);
    const rows = $$('.svc__row');
    let cur = 0;
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      imgs.forEach((im) => { if (im.dataset.srcset) { im.srcset = im.dataset.srcset; im.src = im.dataset.src; } });
    };
    const show = (i) => {
      if (i === cur || !imgs[i]) return;
      imgs.forEach((im, k) => { im.classList.toggle('is-prev', k === cur); im.classList.toggle('is-on', k === i); });
      rows.forEach((r, k) => r.classList.toggle('is-on', k === i));
      cur = i;
    };
    const list = $('.svc__list');
    list.addEventListener('pointerenter', load);
    list.addEventListener('focusin', load);
    rows.forEach((r, i) => {
      r.addEventListener('pointerenter', () => show(i));
      r.addEventListener('focusin', () => show(i));
    });
  }

  /* ---------- numbers odometer: every digit rolls through 0-9 and lands on its target ---------- */
  function odometer() {
    const nums = $$('[data-odo]');
    if (reduce || !nums.length || !('IntersectionObserver' in window)) return;
    nums.forEach((n) => {
      const text = n.textContent.trim();
      const sr = Object.assign(document.createElement('span'), { className: 'vh', textContent: text });
      const vis = Object.assign(document.createElement('span'), { className: 'odo' });
      vis.setAttribute('aria-hidden', 'true');
      [...text].forEach((ch) => {
        if (!/\d/.test(ch)) { vis.appendChild(Object.assign(document.createElement('span'), { textContent: ch })); return; }
        const col = Object.assign(document.createElement('span'), { className: 'odo__col' });
        col.dataset.to = String(10 + Number(ch));
        for (let k = 0; k < 20; k++) col.appendChild(Object.assign(document.createElement('span'), { textContent: String(k % 10) }));
        vis.appendChild(col);
      });
      n.replaceChildren(sr, vis);
    });
    const settle = (n, now) => {
      io.unobserve(n);
      $$('.odo__col', n).forEach((c, i) => {
        if (now) c.style.transition = 'none';
        else c.style.transitionDelay = `${i * 90}ms`;
        c.style.transform = `translateY(-${c.dataset.to}em)`;
      });
    };
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) settle(en.target);
    }), { threshold: 0.3 });
    nums.forEach((n) => io.observe(n));
    addEventListener('beforeprint', () => nums.forEach((n) => settle(n, true)));
    // failsafe: a stalled observer (background tab) must not leave passed numbers at zero
    setTimeout(() => nums.forEach((n) => { if (n.getBoundingClientRect().top < innerHeight) settle(n); }), 4000);
  }

  /* ---------- process steps: long text folds into «Подробнее» below 1024px, always open on desktop ---------- */
  function processMore() {
    const wide = matchMedia('(min-width: 1024px)');
    const sync = () => $$('.ppanel__more').forEach((d) => { d.open = wide.matches; });
    sync();
    wide.addEventListener('change', sync);
  }

  /* ---------- Yandex map: click-to-load iframe ---------- */
  function maps() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-map-load]');
      if (!b) return;
      const box = b.closest('[data-map]');
      if (!box || box.classList.contains('is-live')) return;
      const f = document.createElement('iframe');
      f.src = 'https://yandex.ru/map-widget/v1/?ll=38.989947%2C45.06221&z=16&pt=38.989947%2C45.06221%2Cpm2rdm';
      f.title = 'Карта: Бари Принт, Краснодар, ул. Зиповская, 5в, лит. С';
      f.loading = 'lazy';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.allowFullscreen = true;
      box.appendChild(f);
      box.classList.add('is-live');
      f.tabIndex = 0;
      f.focus();
    });
  }

  /* ---------- cookies: Metrika only after «Принять»; goals only once it is loaded ---------- */
  const YM_ID = 110315766;
  let ymOn = false;
  function metrika() {
    if (ymOn) return;
    ymOn = true;
    const w = window;
    w.ym = w.ym || function ym() { (w.ym.a = w.ym.a || []).push(arguments); };
    w.ym.l = Date.now();
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.appendChild(s);
    w.ym(YM_ID, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
  }
  function cookies() {
    const box = $('#cookie');
    const KEY = 'bp-consent';
    const choice = store(KEY);
    if (choice === 'yes') metrika();
    else if (choice === 'no') purgeMetrika();
    if (!box) return;
    if (!choice) box.hidden = false;
    let opener = null;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-consent]');
      if (!b) return;
      store(KEY, b.dataset.consent);
      const hadFocus = box.contains(document.activeElement);
      box.hidden = true;
      if (hadFocus || opener) (opener && opener.isConnected ? opener : $('#main')).focus({ preventScroll: true });
      opener = null;
      if (b.dataset.consent === 'yes') metrika();
      else if (ymOn) forgetMetrika(); // withdrawn consent: Metrika is already running in this page
    });
    $$('[data-cookie-open]').forEach((b) => b.addEventListener('click', () => {
      opener = b;
      box.hidden = false;
      $('[data-consent]', box).focus();
    }));
    const PROTO = { 'tel:': 'click_phone', 'mailto:': 'click_email' };
    const HOSTS = { 't.me': 'click_telegram', 'max.ru': 'click_max', 'vk.com': 'click_vk' };
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || !ymOn || typeof window.ym !== 'function') return;
      let u;
      try { u = new URL(a.href); } catch (err) { return; }
      const g = PROTO[u.protocol] || HOSTS[u.hostname.replace(/^www\./, '')];
      if (g) window.ym(YM_ID, 'reachGoal', g);
    });
  }
  // expire Metrika's first-party cookies/storage on every domain level it may have used
  function purgeMetrika() {
    const parts = location.hostname.split('.');
    const domains = [''].concat(parts.slice(0, -1).map((_, i) => `;domain=.${parts.slice(i).join('.')}`));
    document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => n.startsWith('_ym'))
      .forEach((n) => domains.forEach((d) => { document.cookie = `${n}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/${d}`; }));
    try { Object.keys(localStorage).filter((k) => k.startsWith('_ym')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* storage blocked */ }
  }
  // the running tag rewrites its storage on unload, so the reloaded page purges once more (choice === 'no')
  function forgetMetrika() {
    purgeMetrika();
    location.reload();
  }

  /* ---------- requisites: copy buttons ---------- */
  function copyButtons() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-copy]');
      if (!b) return;
      // fallback for denied/missing Clipboard API: select the visible value and use the legacy copy command
      const legacy = () => {
        const range = document.createRange();
        range.selectNodeContents(b.previousElementSibling || b);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return document.execCommand('copy') ? Promise.resolve() : Promise.reject(new Error('copy failed'));
      };
      const write = navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy).catch(legacy) : legacy();
      write.then(() => {
        let ok = b.nextElementSibling;
        if (!ok || !ok.classList.contains('copy__ok')) {
          ok = Object.assign(document.createElement('span'), { className: 'copy__ok', textContent: 'Скопировано' });
          b.after(ok);
        }
        const status = $('.req__status');
        if (status) status.textContent = 'Скопировано';
        clearTimeout(b.bpT);
        b.bpT = setTimeout(() => { ok.remove(); if (status) status.textContent = ''; }, 1500);
      }).catch(() => { /* both copy paths denied: the value stays selected for a manual Ctrl+C */ });
    });
  }

  /* ---------- policy pages: highlight the current section in the TOC ---------- */
  function toc() {
    const links = $$('.toc a');
    if (!links.length || !('IntersectionObserver' in window)) return;
    const byId = new Map(links.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.classList.remove('is-on'));
      const a = byId.get(en.target.id);
      if (a) a.classList.add('is-on');
    }), { rootMargin: '0px 0px -70% 0px' });
    byId.forEach((a, id) => { const h = document.getElementById(id); if (h) io.observe(h); });
  }

  /* ---------- /keis: native <dialog> lightbox ---------- */
  function lightbox() {
    const box = $('#lbox');
    if (!box || !box.showModal) return;
    const img = $('img', box);
    const cap = $('[data-lbox-cap]', box);
    let from = null;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lbox]');
      if (!b) return;
      from = b;
      const src = $('img', b);
      const url = b.dataset.lbox;
      // hide the previous photo until the new one is decoded (the old image stays painted while the new one loads)
      img.style.visibility = 'hidden';
      img.removeAttribute('srcset');
      img.src = url;
      img.decode().catch(() => {}).then(() => { if (img.getAttribute('src') === url) img.style.visibility = ''; });
      img.alt = src ? src.alt : '';
      cap.textContent = b.dataset.cap || '';
      box.showModal();
    });
    box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-lbox-close]')) box.close(); });
    box.addEventListener('close', () => { if (from) from.focus(); });
  }

  function start() {
    try { sessionStorage.setItem('bp-seen', '1'); } catch (e) { /* private mode: the intro may repeat */ }
    // one broken module must never block the rest, and above all must never leave the hero hidden
    const report = (e) => setTimeout(() => { throw e; });
    const safe = (f) => { try { f(); } catch (e) { report(e); } };
    [header, tabs, contactSheet, buttons, services, odometer, processMore, maps, cookies, copyButtons, toc, lightbox].forEach(safe);
    try {
      intro(() => safe(reveal));
    } catch (e) {
      html.classList.remove('bp-intro', 'hero-wait');
      $$('.bp-intro-el').forEach((el) => el.remove());
      report(e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
