(function() {
  'use strict';
  let selectedText = '', dotEl = null, tipEl = null, tipVisible = false, abortCtrl = null;
  let cfg = { apiUrl: '', apiKey: '', model: 'gpt-3.5-turbo', enableAI: true };

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
    document.body.appendChild(dotEl);
    dotEl.onmouseenter = onDotEnter; dotEl.onmouseleave = onDotLeave;
    return dotEl;
  }

  function makeTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div'); tipEl.id = 'translate-tooltip';
    document.body.appendChild(tipEl);
    tipEl.onmouseenter = () => { tipVisible = true; };
    tipEl.onmouseleave = () => { hideTip(); };
    return tipEl;
  }

  function showDot(x, y) { const d = makeDot(); d.style.left = (x+5)+'px'; d.style.top = (y-10)+'px'; d.style.display = 'flex'; }
  function hideDot() { if (dotEl) dotEl.style.display = 'none'; }
  function showTip(x, y, c) { const t = makeTip(); t.innerHTML = c; t.style.left = x+'px'; t.style.top = (y+25)+'px'; t.style.display = 'block'; tipVisible = true; }
  function updateTip(c) { if (tipEl && tipVisible) tipEl.innerHTML = c; }
  function hideTip() { tipVisible = false; if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; } setTimeout(() => { if (!tipVisible && tipEl) tipEl.style.display = 'none'; }, 100); }

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
    tipVisible = true;
    const rect = dotEl.getBoundingClientRect();
    const x = rect.left + window.scrollX, y = rect.bottom + window.scrollY;
    showTip(x, y, '<div class="translate-loading">翻译中...</div>');
    speak(selectedText, getSrcLang(selectedText));
    const tr = await trans(selectedText);
    if (tipVisible) {
      updateTip(html(selectedText, tr, '', cfg.enableAI && cfg.apiKey));
      streamAI(selectedText, selectedText, tr);
    }
  }

  function onDotLeave() { hideTip(); }

  document.addEventListener('mouseup', (e) => {
    if (e.target.id === 'translate-dot' || e.target.closest('#translate-tooltip')) return;
    setTimeout(() => {
      const sel = window.getSelection(), txt = sel.toString().trim();
      if (txt && txt.length > 0 && txt.length < 1000) {
        selectedText = txt;
        const rng = sel.getRangeAt(0), rect = rng.getBoundingClientRect();
        showDot(rect.right + window.scrollX, rect.top + window.scrollY);
      } else { selectedText = ''; hideDot(); hideTip(); }
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (e.target.id === 'translate-dot' || e.target.closest('#translate-tooltip')) return;
    hideDot(); hideTip(); speechSynthesis.cancel();
  });

  document.addEventListener('scroll', () => { hideDot(); hideTip(); });
})();
