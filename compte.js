(() => {
  const cfg = window.ZANDO_CONFIG || {};
  const db = window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const endpoint = String(cfg.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/' + (cfg.DOWNLOAD_FUNCTION || 'zando-download');
  const LABEL = { pending: 'En attente de paiement', payment_review: 'Paiement en cours de vérification', paid: 'Payée', delivered: 'Livrée', cancelled: 'Annulée' };
  const money = (o) => o.currency === 'CDF' ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(o.total_cdf)) + ' FC' : '$' + Number(o.total_usd).toFixed(2);
  const fdate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const wa = (text) => 'https://wa.me/' + String(cfg.WHATSAPP_NUMBER || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(text);
  const status = (m, k) => { const n = $('#acctStatus'); n.hidden = !m; n.textContent = m || ''; n.className = 'auth-alert' + (k ? ' ' + k : ''); };

  function card(o) {
    const ref = String(o.id).slice(0, 8).toUpperCase();
    const paid = o.status === 'paid' || o.status === 'delivered';
    const cancelled = o.status === 'cancelled';
    const items = o.items || [];
    const active = !!(o.download && o.download.remaining > 0);
    let action = '';
    if (cancelled) action = '<p class="note">Cette commande a été annulée.</p>';
    else if (!paid) action = '<p class="note">Après votre paiement Mobile Money, écrivez-nous sur WhatsApp avec cette référence : nous vérifions votre paiement puis débloquons vos ebooks ici.</p><a class="btn-wa" target="_blank" rel="noopener" href="' + esc(wa('Bonjour Zandonova, j’ai payé ma commande ' + o.id + '. Voici ma référence de transaction : ')) + '">Écrire sur WhatsApp</a>';
    else if (active) {
      action = items.filter((i) => i.product_id).map((i) => '<div class="dl-item"><div><b>' + esc(i.title) + '</b><small>Format PDF</small></div><button class="btn btn-primary" data-order="' + esc(o.id) + '" data-pid="' + esc(i.product_id) + '">Télécharger</button></div>').join('')
        + '<small class="form-note">Téléchargements restants : ' + o.download.remaining + ' · accès jusqu’au ' + esc(fdate(o.download.expires_at)) + '.</small>';
    } else action = '<p class="note">' + (o.download ? 'Le nombre de téléchargements autorisés est atteint.' : 'Paiement confirmé. Votre accès au téléchargement n’est pas (ou plus) actif.') + '</p><a class="btn-wa" target="_blank" rel="noopener" href="' + esc(wa('Bonjour Zandonova, pouvez-vous réactiver le téléchargement de ma commande ' + o.id + ' ?')) + '">Demander un nouvel accès</a>';
    const steps = cancelled ? '' : '<div class="steps" aria-label="Progression de la commande"><div class="step done">Commande reçue</div><div class="step' + (paid ? ' done' : '') + '">Paiement vérifié</div><div class="step' + (active ? ' done' : '') + '">Ebook disponible</div></div>';
    return '<article class="order-card"><div class="order-top"><div><div class="order-ref">Commande ' + esc(ref) + '</div><div class="order-sub">' + esc(fdate(o.created_at)) + '</div></div><span class="status-pill ' + (paid ? 'paid' : o.status === 'pending' ? 'pending' : '') + '">' + esc(LABEL[o.status] || o.status) + '</span></div>'
      + '<div class="order-items">' + items.map((i) => '<span>' + esc(i.title) + ' × ' + esc(i.quantity) + '</span>').join('') + '</div><div class="order-total">' + esc(money(o)) + '</div>' + steps + '<div class="order-action">' + action + '</div></article>';
  }


  // Quand aucune réponse n'arrive : on sonde le service pour dire s'il est injoignable (réseau) ou joignable mais bloqué (autorisation / réglage de sécurité).
  async function unreachable() {
    let code = 'DL-RESEAU';
    try { await fetch(endpoint, { method: 'GET', mode: 'no-cors' }); code = 'DL-BLOQUE'; } catch (e) { /* injoignable */ }
    return new Error('Le service de téléchargement n’a pas répondu. Réessayez dans un instant ; si le problème continue, contactez-nous sur WhatsApp en indiquant ce code : ' + code + '.');
  }

  async function load() {
    const { data, error } = await db.rpc('zando_my_orders');
    if (error) { status(/does not exist|schema cache|Could not find/i.test(error.message || '') ? 'Cette fonctionnalité n’est pas encore activée sur le serveur. Contactez Zandonova.' : 'Impossible de charger vos commandes. Réessayez dans un instant.', 'error'); $('#ordersBox').innerHTML = ''; return; }
    const orders = Array.isArray(data) ? data : [];
    status('');
    $('#ordersBox').innerHTML = orders.length ? orders.map(card).join('') : '<div class="acct-empty"><b>Aucune commande pour le moment</b><p>Vous n’avez pas encore de commande liée à ce compte.</p><a class="btn btn-primary" href="./#catalogue">Découvrir les ebooks</a></div>';
  }

  $('#ordersBox').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pid]'); if (!b) return;
    b.disabled = true; const label = b.textContent; b.textContent = 'Préparation…';
    try {
      const { data: s } = await db.auth.getSession(); const token = s && s.session && s.session.access_token;
      if (!token) { location.href = './connexion.html'; return; }
      let res, out = {};
      try { res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.SUPABASE_PUBLISHABLE_KEY || '', Authorization: 'Bearer ' + token }, body: JSON.stringify({ order_id: b.dataset.order, product_id: b.dataset.pid }) }); }
      catch (err) { throw await unreachable(); }
      try { out = await res.json(); } catch (err) { /* réponse non JSON */ }
      if (!res.ok || !out.ok) throw new Error(out.error || 'Service momentanément indisponible. Réessayez dans un instant.');
      const a = document.createElement('a'); a.href = out.url; a.rel = 'noopener'; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
      status('Téléchargement lancé. S’il ne démarre pas, réessayez.', 'ok'); await load();
    } catch (err) { status(err.message, 'error'); b.disabled = false; b.textContent = label; }
  });

  $('#logoutBtn').addEventListener('click', async () => { await db.auth.signOut(); location.href = './connexion.html'; });

  (async () => {
    if (!db || !cfg.SUPABASE_URL) { $('#acctHello').innerHTML = '<h1>Mon compte</h1>'; return status('Service indisponible. Vérifiez votre connexion Internet puis actualisez.', 'error'); }
    let session = null;
    try { const { data } = await db.auth.getSession(); session = data && data.session; } catch (e) { /* ignoré */ }
    if (!session) { location.href = './connexion.html'; return; }
    const u = session.user || {}; const name = (u.user_metadata && u.user_metadata.full_name) || '';
    $('#acctHello').innerHTML = '<h1>' + (name ? 'Bonjour ' + esc(name) : 'Mon compte') + '</h1><p>' + esc(u.email || '') + '</p>';
    $('#avatar').textContent = (name || u.email || 'Z').trim().charAt(0).toUpperCase();
    $('#logoutBtn').hidden = false; await load();
  })();
})();
