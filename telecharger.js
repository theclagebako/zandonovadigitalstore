(() => {
  const cfg = window.ZANDO_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Le jeton est dans le fragment (#...) : il n'est jamais envoyé au serveur Netlify ni dans le Referer.
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const orderId = params.get('o') || '';
  const token = params.get('t') || '';
  const endpoint = String(cfg.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/' + (cfg.DOWNLOAD_FUNCTION || 'zando-download');
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const status = (msg, kind) => { const n = $('#dlStatus'); n.hidden = !msg; n.textContent = msg || ''; n.className = 'dl-status' + (kind ? ' ' + kind : ''); };


  // Quand aucune réponse n'arrive : on sonde le service pour dire s'il est injoignable (réseau) ou joignable mais bloqué (autorisation / réglage de sécurité).
  async function unreachable() {
    let code = 'DL-RESEAU';
    try { await fetch(endpoint, { method: 'GET', mode: 'no-cors' }); code = 'DL-BLOQUE'; } catch (e) { /* injoignable */ }
    return new Error('Le service de téléchargement n’a pas répondu. Réessayez dans un instant ; si le problème continue, contactez-nous sur WhatsApp en indiquant ce code : ' + code + '.');
  }

  async function call(body) {
    let res, data = {};
    try {
      res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.SUPABASE_PUBLISHABLE_KEY || '' }, body: JSON.stringify(body) });
    } catch (e) { throw await unreachable(); }
    try { data = await res.json(); } catch (e) { /* réponse non JSON */ }
    if (!res.ok || !data.ok) throw new Error(data.error || 'Service momentanément indisponible. Réessayez dans un instant.');
    return data;
  }

  function render(data) {
    status('');
    $('#dlList').innerHTML = (data.items || []).map((it) =>
      '<div class="dl-item"><div><b>' + esc(it.title) + '</b><small>Format PDF</small></div>' +
      '<button class="btn btn-primary" data-pid="' + esc(it.product_id) + '"' + (data.remaining < 1 ? ' disabled' : '') + '>Télécharger</button></div>').join('') ||
      '<div class="dl-status error">Aucun ebook disponible pour cette commande.</div>';
    const meta = $('#dlMeta');
    meta.hidden = false;
    meta.textContent = 'Téléchargements restants : ' + data.remaining + ' · Lien valable jusqu’au ' + new Date(data.expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + '.';
  }

  async function refresh() { render(await call({ order_id: orderId, token })); }

  $('#dlList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pid]');
    if (!b) return;
    b.disabled = true;
    const label = b.textContent; b.textContent = 'Préparation…';
    try {
      const data = await call({ order_id: orderId, token, product_id: b.dataset.pid });
      const a = document.createElement('a');
      a.href = data.url; a.rel = 'noopener'; a.download = '';
      document.body.appendChild(a); a.click(); a.remove();
      status('Téléchargement lancé. S’il ne démarre pas, réessayez.', 'ok');
      await refresh();
    } catch (err) { status(err.message, 'error'); b.disabled = false; b.textContent = label; }
  });

  (async () => {
    if (!UUID.test(orderId) || !/^[0-9a-f]{64}$/.test(token)) { status('Lien incomplet. Utilisez le lien complet reçu sur WhatsApp.', 'error'); return; }
    if (!cfg.SUPABASE_URL) { status('Configuration manquante : contactez Zandonova.', 'error'); return; }
    try { await refresh(); } catch (err) { status(err.message, 'error'); }
  })();
})();
