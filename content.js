(function() {
  'use strict';
  let selectedText = '', dotEl = null, tipEl = null, tipVisible = false, abortCtrl = null;
  let tipAnchorX = 0, tipAnchorY = 0;
  let hoverDot = false, hoverTip = false, hideTimer = null;
  let selTimer = null, lastUpX = 0, lastUpY = 0, lastUpAt = 0;
  let cfg = { apiUrl: '', apiKey: '', model: 'gpt-3.5-turbo', enableAI: true };

  const DOT_PAD = 6, TIP_PAD = 8, DOT_OX = 5, DOT_OY = -10, TIP_OY = 10;

  function clamp(n, min, max) { if (max < min) return min; return Math.min(Math.max(n, min), max); }
  function viewBox() {
    const vv = window.visualViewport;
    const left = vv ? vv.pageLeft : window.scrollX;
    const top = vv ? vv.pageTop : window.scrollY;
    const width = vv ? vv.width : window.innerWidth;
    const height = vv ? vv.height : window.innerHeight;
    return { left, top, right: left + width, bottom: top + height, width, height };
  }

  function cancelHide() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }
  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(() => { if (!hoverDot && !hoverTip) hideTip(); }, 300);
  }

  function loadCfg() {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get({ apiUrl: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-3.5-turbo', enableAI: true }, r => { cfg = r; });
    }
  }
  loadCfg();
  if (chrome.storage && chrome.storage.onChanged) chrome.storage.onChanged.addListener((c, n) => { if (n === 'sync') for (let k in c) cfg[k] = c[k].newValue; });

  function makeDot() {
    if (dotEl) return dotEl;
    dotEl = document.createElement('div'); dotEl.id = 'translate-dot'; dotEl.innerHTML = '译';
    (document.body || document.documentElement).appendChild(dotEl);
    dotEl.onmouseenter = onDotEnter; dotEl.onmouseleave = onDotLeave;
    return dotEl;
  }

  function makeTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div'); tipEl.id = 'translate-tooltip';
    (document.body || document.documentElement).appendChild(tipEl);
    tipEl.onmouseenter = () => { hoverTip = true; tipVisible = true; cancelHide(); };
    tipEl.onmouseleave = () => { hoverTip = false; scheduleHide(); };
    return tipEl;
  }

  function showDot(x, y) {
    const d = makeDot();
    d.style.display = 'flex';
    const v = viewBox();
    const w = d.offsetWidth || 26, h = d.offsetHeight || 26;
    let left = x + DOT_OX, top = y + DOT_OY;
    left = clamp(left, v.left + DOT_PAD, v.right - w - DOT_PAD);
    top = clamp(top, v.top + DOT_PAD, v.bottom - h - DOT_PAD);
    d.style.left = left + 'px'; d.style.top = top + 'px';
  }
  function hideDot() { hoverDot = false; if (dotEl) dotEl.style.display = 'none'; }
  function positionTip() {
    if (!tipEl || !tipVisible) return;
    const v = viewBox();
    const maxW = Math.max(160, Math.min(420, v.width - TIP_PAD * 2));
    const minW = Math.min(220, maxW);
    tipEl.style.maxWidth = maxW + 'px';
    tipEl.style.minWidth = minW + 'px';
    const w = tipEl.offsetWidth || minW, h = tipEl.offsetHeight || 0;
    const dotH = (dotEl && dotEl.style.display !== 'none' ? dotEl.offsetHeight : 0) || 26;
    let left = clamp(tipAnchorX, v.left + TIP_PAD, v.right - w - TIP_PAD);
    const topBelow = tipAnchorY + TIP_OY;
    const topAbove = (tipAnchorY - dotH) - h - TIP_OY;
    let top = topBelow;
    if (topBelow + h > v.bottom - TIP_PAD && topAbove >= v.top + TIP_PAD) top = topAbove;
    top = clamp(top, v.top + TIP_PAD, v.bottom - h - TIP_PAD);
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }
  function showTip(x, y, c) {
    const t = makeTip();
    tipAnchorX = x; tipAnchorY = y;
    t.innerHTML = c;
    t.style.display = 'block';
    tipVisible = true;
    positionTip();
  }
  function updateTip(c) { if (tipEl && tipVisible) { tipEl.innerHTML = c; positionTip(); } }
  function hideTip() { tipVisible = false; hoverTip = false; cancelHide(); if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; } setTimeout(() => { if (!tipVisible && tipEl) tipEl.style.display = 'none'; }, 100); }

  function getSelectionRect(sel) {
    if (!sel || !sel.rangeCount) return null;
    try {
      const range = sel.getRangeAt(0);
      const rects = range.getClientRects();
      if (rects && rects.length) return rects[rects.length - 1];
      const rect = range.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) return rect;
    } catch (e) {}
    return null;
  }

  function isUIEventTarget(t) {
    if (!t) return false;
    if (t === dotEl || t === tipEl) return true;
    if (!(t instanceof Element)) return false;
    return t.id === 'translate-dot' || !!t.closest('#translate-dot,#translate-tooltip');
  }

  function getInputSelectionEl() {
    const el = document.activeElement;
    if (!el) return null;
    if (el.tagName === 'TEXTAREA') return el;
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (!type || type === 'text' || type === 'search' || type === 'url' || type === 'email' || type === 'tel' || type === 'password') return el;
    }
    return null;
  }

  function getSelectedInfo() {
    const sel = window.getSelection ? window.getSelection() : null;
    const text = (sel ? sel.toString() : '').trim();
    if (text) return { text, rect: getSelectionRect(sel) };
    const el = getInputSelectionEl();
    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number' && el.selectionEnd > el.selectionStart) {
      const t = (el.value || '').slice(el.selectionStart, el.selectionEnd).trim();
      if (t) return { text: t, rect: el.getBoundingClientRect() };
    }
    return { text: '', rect: null };
  }

  function updateFromSelection(fallbackX, fallbackY) {
    const { text, rect } = getSelectedInfo();
    if (text && text.length > 0 && text.length < 1000) {
      if (selectedText && selectedText !== text) hideTip();
      selectedText = text;
      const v = viewBox();
      if (rect) showDot(rect.right + v.left, rect.bottom + v.top);
      else if (typeof fallbackX === 'number' && typeof fallbackY === 'number') showDot(fallbackX + v.left, fallbackY + v.top);
      else hideDot();
    } else { selectedText = ''; hideDot(); hideTip(); }
  }

  function scheduleSelectionUpdate(delay, fallbackX, fallbackY) {
    if (selTimer) clearTimeout(selTimer);
    selTimer = setTimeout(() => { selTimer = null; updateFromSelection(fallbackX, fallbackY); }, delay);
  }

  function getLang(t) { return /[\u4e00-\u9fa5]/.test(t) ? 'en' : 'zh-CN'; }
  function getSrcLang(t) { return /[\u4e00-\u9fa5]/.test(t) ? 'zh-CN' : 'en-US'; }
  function speak(t, l) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = l; u.rate = 0.9; speechSynthesis.speak(u); }

  async function trans(t) {
    const l = getLang(t), url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + l + '&dt=t&q=' + encodeURIComponent(t);
    try { const r = await fetch(url), d = await r.json(); if (d && d[0]) { let s = ''; for (let i = 0; i < d[0].length; i++) if (d[0][i][0]) s += d[0][i][0]; return s; } return '翻译失败'; } catch (e) { return '翻译失败'; }
  }

  function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function fmtAI(c) { return esc(c).replace(/【(.*?)】/g, '<strong class="ai-label">【$1】</strong>').replace(/\n/g, '<br>'); }

  function prompt(t) {
    if (/[\u4e00-\u9fa5]/.test(t)) return '请简要解释这个中文词语的含义，并提供2个英文例句。格式：\n【释义】简短解释\n【例句】\n1. 例句1\n2. 例句2\n\n词语：' + t;
    return '请简要解释这个英文单词/短语的含义（包括词性），并提供2个例句。格式：\n【释义】词性. 简短中文解释\n【例句】\n1. 英文例句 - 中文翻译\n2. 英文例句 - 中文翻译\n\n单词：' + t;
  }

  function html(o, tr, ai, ld) {
    let h = '<div class="translate-content"><div class="translate-original">' + esc(o) + '</div><div class="translate-result">' + esc(tr) + '</div></div>';
    if (cfg.enableAI && cfg.apiKey) {
      h += '<div class="ai-section">';
      if (ld && !ai) h += '<div class="ai-loading"><span class="ai-spinner"></span>AI解释中...</div>';
      else if (ai) { h += '<div class="ai-content">' + fmtAI(ai) + '</div>'; }
      h += '</div>';
    }
    return h;
  }

  async function streamAI(t, o, tr) {
    if (!cfg.enableAI || !cfg.apiKey || !cfg.apiUrl) return;
    abortCtrl = new AbortController();
    const DONE_MARKER = '[' + 'DONE' + ']';
    try {
      const res = await fetch(cfg.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: '你是一个简洁的词典助手。只输出释义和例句，不要有多余的解释。保持简短。' }, { role: 'user', content: prompt(t) }], stream: true, max_tokens: 300, temperature: 0.3 }),
        signal: abortCtrl.signal
      });
      if (!res.ok) throw new Error('err');
      const rd = res.body.getReader(), dec = new TextDecoder();
      let ai = '';
      while (true) {
        const { done, value } = await rd.read();
        if (done) break;
        for (const ln of dec.decode(value).split('\n')) {
          if (ln.startsWith('data: ')) {
            const d = ln.slice(6).trim();
            if (d === DONE_MARKER) continue;
            try {
              const j = JSON.parse(d);
              const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
              if (delta) { ai += delta; updateTip(html(o, tr, ai, true)); }
            } catch (e) {}
          }
        }
      }
      updateTip(html(o, tr, ai, false));
    } catch (e) { if (e.name !== 'AbortError') console.error(e); }
  }

  async function onDotEnter() {
    if (!selectedText) return;
    hoverDot = true; cancelHide();
    tipVisible = true;
    const rect = dotEl.getBoundingClientRect();
    const v = viewBox();
    const x = rect.left + v.left, y = rect.bottom + v.top;
    showTip(x, y, '<div class="translate-loading">翻译中...</div>');
    speak(selectedText, getSrcLang(selectedText));
    const tr = await trans(selectedText);
    if (tipVisible) {
      updateTip(html(selectedText, tr, '', cfg.enableAI && cfg.apiKey));
      streamAI(selectedText, selectedText, tr);
    }
  }

  function onDotLeave() { hoverDot = false; scheduleHide(); }

  document.addEventListener('pointerup', (e) => {
    if (isUIEventTarget(e.target)) return;
    lastUpX = e.clientX; lastUpY = e.clientY;
    lastUpAt = Date.now();
    scheduleSelectionUpdate(10, lastUpX, lastUpY);
  }, true);

  document.addEventListener('mouseup', (e) => {
    if (isUIEventTarget(e.target)) return;
    lastUpX = e.clientX; lastUpY = e.clientY;
    lastUpAt = Date.now();
    scheduleSelectionUpdate(10, lastUpX, lastUpY);
  }, true);

  document.addEventListener('selectionchange', () => {
    if (Date.now() - lastUpAt < 150) return;
    scheduleSelectionUpdate(80, lastUpX, lastUpY);
  }, true);

  document.addEventListener('pointerdown', (e) => {
    if (isUIEventTarget(e.target)) return;
    hideDot(); hideTip(); speechSynthesis.cancel();
  }, true);

  document.addEventListener('mousedown', (e) => {
    if (isUIEventTarget(e.target)) return;
    hideDot(); hideTip(); speechSynthesis.cancel();
  }, true);

  document.addEventListener('scroll', (e) => {
    if (isUIEventTarget(e.target)) return;
    hideDot(); hideTip();
  }, true);
})();
