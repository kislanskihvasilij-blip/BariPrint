// BariPrint FX: 21tsi-style intro, scroll reveal, liquid buttons, menu drop. No dependencies; paired with bp-fx.css.
(() => {
  const html = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BRAND = 'БариПринт';
  const ACCENT_FROM = 4; // "Принт" in brand blue
  const ABC = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
  const WORDS = ['Печать', 'Реклама', 'Производство'];
  const INTRO_MS = 2300;
  const TICKS = 18;
  const BUTTONS = '.t-btn, .t-submit, .tn-elem[data-elem-type="button"] .tn-atom';

  const hasFixed = (rec) => {
    for (const el of rec.querySelectorAll('*')) {
      const p = getComputedStyle(el).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  };

  // like 21tsi's 0 -> 21 counter: every letter "counts" up the alphabet from А to its own letter, all landing together
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

  /* ---------- intro: words in a mask, brand counted letter by letter, curtain up ---------- */
  function intro(done) {
    if (!html.classList.contains('bp-intro')) return done(false);
    try { sessionStorage.setItem('bp-intro', '1'); } catch (e) { /* private mode: intro may repeat */ }
    const el = document.createElement('div');
    el.className = 'bp-intro';
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
    html.classList.remove('bp-intro');
    countBrand(head, tail);
    setTimeout(() => el.classList.add('is-run'), 30); // not rAF: it stalls in background tabs and the intro would skip
    setTimeout(() => { el.classList.add('is-out'); done(true); }, INTRO_MS);
    setTimeout(() => el.remove(), INTRO_MS + 1000);
  }

  /* ---------- scroll reveal: rise + unblur, hero unblurs harder after the intro ---------- */
  function reveal(afterIntro, recs) {
    if (reduce || !('IntersectionObserver' in window)) return;
    const vh = innerHeight;
    let batch = 0;
    const play = (rec) => {
      rec.style.transitionDelay = `${batch++ * 90}ms`;
      setTimeout(() => { batch = 0; }, 50);
      rec.classList.add('bp-rv--in');
      setTimeout(() => {
        rec.classList.remove('bp-rv', 'bp-rv--in', 'bp-rv--hero');
        rec.style.transitionDelay = '';
      }, 1700);
    };
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      play(en.target);
    }), { rootMargin: '0px 0px -8% 0px' });
    recs.forEach((rec) => {
      const top = rec.getBoundingClientRect().top;
      if (top < vh && !afterIntro) return; // already on screen without an intro: don't flash it
      rec.classList.add('bp-rv');
      if (top < vh) rec.classList.add('bp-rv--hero');
      io.observe(rec);
    });
  }

  /* ---------- liquid buttons: cursor shine, ripple from the tap point, springy press ---------- */
  function layer(btn) {
    let fx = btn.querySelector(':scope > .bp-btnfx');
    if (fx) return fx;
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    fx = document.createElement('span');
    fx.className = 'bp-btnfx';
    fx.setAttribute('aria-hidden', 'true');
    btn.appendChild(fx);
    return fx;
  }
  function buttons() {
    const find = (e) => e.target.closest && e.target.closest(BUTTONS);
    document.addEventListener('pointerover', (e) => { const b = find(e); if (b) layer(b); }, { passive: true });
    document.addEventListener('pointermove', (e) => {
      const b = e.pointerType === 'mouse' && find(e);
      if (!b) return;
      const r = b.getBoundingClientRect();
      b.style.setProperty('--bp-x', `${e.clientX - r.left}px`);
      b.style.setProperty('--bp-y', `${e.clientY - r.top}px`);
    }, { passive: true });
    if (reduce) return;
    document.addEventListener('pointerdown', (e) => {
      const b = find(e);
      if (!b) return;
      const r = b.getBoundingClientRect();
      const d = Math.hypot(r.width, r.height) * 2;
      const drop = document.createElement('i');
      drop.style.cssText = `left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px;width:${d}px;height:${d}px`;
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

  /* ---------- header menu: a water drop that springs to the hovered link and stretches in flight ---------- */
  function menuDrop(headers) {
    if (reduce || !matchMedia('(hover: hover)').matches) return;
    headers.forEach((rec) => {
      // menu items are short text links or transparent Zero Block buttons; filled CTAs and phone links are skipped
      const links = [...rec.querySelectorAll('.tn-elem a.tn-atom')].filter((a) =>
        /^[^\d+]{2,24}$/.test(a.textContent.trim()) && /rgba\(.*,\s*0\)|transparent/.test(getComputedStyle(a).backgroundColor));
      if (!links.length) return;
      // the drop is the only hover cue: pin Tilda's hover recolor to the resting color
      links.forEach((a) => a.style.setProperty('color', getComputedStyle(a).color, 'important'));
      const board = links[0].closest('.t396__artboard');
      if (!board) return;
      // sit inside the innermost group holding every link, so the group's own background can't cover the drop
      let box = links[0].closest('.tn-group') || board;
      while (box !== board && !links.every((a) => box.contains(a))) box = box.parentElement.closest('.tn-group') || board;
      const drop = document.createElement('span');
      drop.className = 'bp-drop';
      drop.setAttribute('aria-hidden', 'true');
      box.insertBefore(drop, box.firstChild);

      const L = { x: 0, v: 0 }, R = { x: 0, v: 0 }, tgt = { l: 0, r: 0, y: 0, h: 0 };
      let raf = 0, last = 0, ready = false, hideTimer = 0;
      const STEP = 1 / 120;
      const step = () => {
        const goingRight = tgt.l > L.x;
        [[L, tgt.l, !goingRight], [R, tgt.r, goingRight]].forEach(([b, t, lead]) => {
          const k = lead ? 320 : 150, c = lead ? 34 : 22; // leading edge snaps, trailing edge lags briefly: the drop stretches
          b.v += (k * (t - b.x) - c * b.v) * STEP;
          b.x += b.v * STEP;
        });
      };
      const tick = (now) => {
        // integrate real elapsed time in fixed substeps, so slow or dropped frames don't make the drop crawl
        const dt = Math.min((now - (last || now - 16)) / 1000, 0.25);
        last = now;
        for (let t = 0; t < dt; t += STEP) step();
        const w = Math.max(R.x - L.x, 8);
        const squash = 1 - Math.min(Math.abs(L.v + R.v) / 6000, 0.18);
        drop.style.width = `${w}px`;
        drop.style.height = `${tgt.h}px`;
        drop.style.transform = `translate(${L.x}px, ${tgt.y}px) scaleY(${squash})`;
        const moving = Math.abs(L.v) + Math.abs(R.v) > 2 || Math.abs(tgt.l - L.x) + Math.abs(tgt.r - R.x) > 0.5;
        raf = moving ? requestAnimationFrame(tick) : 0;
        if (!raf) last = 0;
      };
      // Tilda scales the header with CSS zoom, so map screen px to the drop's own px by nudging it 100px and measuring
      const calibrate = () => {
        const keep = drop.style.transform;
        drop.style.transform = 'translate(0px, 0px)';
        const a0 = drop.getBoundingClientRect();
        drop.style.transform = 'translate(100px, 100px)';
        const a1 = drop.getBoundingClientRect();
        drop.style.transform = keep;
        return { ox: a0.left, oy: a0.top, sx: (a1.left - a0.left) / 100 || 1, sy: (a1.top - a0.top) / 100 || 1 };
      };
      const aim = (a) => {
        const { ox, oy, sx, sy } = calibrate();
        const r = a.getBoundingClientRect();
        const padX = 14, padY = 8;
        tgt.l = (r.left - ox) / sx - padX;
        tgt.r = (r.right - ox) / sx + padX;
        tgt.h = r.height / sy + padY * 2;
        tgt.y = (r.top - oy) / sy - padY;
        if (!ready) { L.x = tgt.l; R.x = tgt.r; ready = true; }
        clearTimeout(hideTimer);
        drop.classList.add('is-on');
        if (!raf) raf = requestAnimationFrame(tick);
      };
      links.forEach((a) => {
        a.addEventListener('pointerenter', () => aim(a));
        a.addEventListener('pointerleave', () => {
          hideTimer = setTimeout(() => { drop.classList.remove('is-on'); ready = false; }, 220);
        });
      });
    });
  }

  function start() {
    const all = [...document.querySelectorAll('.t-rec, .bp-sec')];
    const fixed = new Set(all.filter(hasFixed)); // the header rec has zero height (its content is fixed), so scan all
    const recs = all.filter((r) => r.offsetHeight > 0);
    buttons();
    menuDrop([...fixed].filter((r) => r.dataset.recordType === '396'));
    intro((afterIntro) => reveal(afterIntro, recs.filter((r) => !fixed.has(r))));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
