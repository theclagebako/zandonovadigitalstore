(() => {
  const cfg = window.ZANDO_CONFIG || {};
  const db = window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODES = ['login', 'signup', 'forgot', 'reset'];
  const COPY = {
    login: ['Bon retour', 'Connectez-vous pour retrouver vos commandes et vos ebooks.'],
    signup: ['Créer votre compte', 'Gratuit et rapide. Votre compte vous permet de suivre vos commandes et de télécharger vos ebooks.'],
    forgot: ['Mot de passe oublié', 'Entrez l’adresse e-mail de votre compte : nous vous envoyons un lien pour en choisir un nouveau.'],
    reset: ['Nouveau mot de passe', 'Choisissez un mot de passe d’au moins 8 caractères.'],
  };
  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const go = () => { location.href = './compte.html'; };
  const wa = String(cfg.WHATSAPP_NUMBER || '').replace(/\D/g, '');
  if (wa) $('#helpWa').href = 'https://wa.me/' + wa; else $('#helpWa').removeAttribute('href');

  function clearInvalid() { document.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid')); }
  function msg(text, kind) {
    const n = $('#authMessage'); n.textContent = text || ''; n.hidden = !text; n.className = 'auth-alert' + (kind ? ' ' + kind : '');
    if (text && n.scrollIntoView) n.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // Signale un champ en erreur (bordure rouge + message + focus)
  function invalid(form, name, text) { clearInvalid(); const input = form.elements[name]; if (input) { input.closest('.field').classList.add('invalid'); input.focus(); } msg(text, 'error'); }
  function show(mode) {
    MODES.forEach((m) => { $('#form-' + m).hidden = m !== mode; });
    $('#authDone').hidden = true; $('.auth-head').hidden = false;
    document.querySelectorAll('.seg button').forEach((b) => { const on = b.dataset.mode === mode; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    $('#authTabs').hidden = mode === 'forgot' || mode === 'reset';
    $('#authTitle').textContent = COPY[mode][0]; $('#authSub').textContent = COPY[mode][1];
    clearInvalid(); msg('');
  }
  // On n'affiche jamais le message brut du serveur : texte clair en français, sans détail technique.
  function friendly(err) {
    const m = String((err && err.message) || '');
    if ((err && err.status === 429) || /rate limit|too many|security purposes/i.test(m)) return 'Trop de tentatives. Réessayez dans quelques minutes.';
    if (/invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/email not confirmed/i.test(m)) return 'Confirmez d’abord votre adresse e-mail grâce au message que nous vous avons envoyé.';
    if (/password/i.test(m) && /(least|short|weak|characters|easy|pwned)/i.test(m)) return 'Mot de passe trop faible. Utilisez au moins 8 caractères, difficiles à deviner.';
    if (/signups? (are )?(not allowed|disabled)/i.test(m)) return 'Les inscriptions sont momentanément fermées. Contactez-nous sur WhatsApp.';
    return 'Une erreur est survenue. Réessayez dans un instant.';
  }
  async function busy(form, fn) {
    const btn = form.querySelector('.auth-submit'); const label = btn.textContent;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span><span>Patientez…</span>';
    try { await fn(); } finally { btn.disabled = false; btn.textContent = label; }
  }

  // Écran de confirmation (e-mail envoyé) avec renvoi limité à 1 fois par minute
  let resendFn = null, timer = null;
  function cooldown() {
    const b = $('#resendBtn'); let n = 60; clearInterval(timer);
    const tick = () => { if (n <= 0) { clearInterval(timer); b.disabled = false; b.textContent = 'Renvoyer l’e-mail'; return; } b.disabled = true; b.textContent = 'Renvoyer l’e-mail dans ' + n + ' s'; n -= 1; };
    tick(); timer = setInterval(tick, 1000);
  }
  function done(title, html, resend) {
    MODES.forEach((m) => { $('#form-' + m).hidden = true; }); $('#authTabs').hidden = true; $('.auth-head').hidden = true; msg('');
    $('#doneTitle').textContent = title; $('#doneText').innerHTML = html; $('#authDone').hidden = false; resendFn = resend; cooldown();
  }
  $('#resendBtn').addEventListener('click', async () => {
    if (!resendFn) return; $('#resendBtn').disabled = true;
    try { const { error } = await resendFn(); if (error) msg(friendly(error), 'error'); else msg('E-mail renvoyé. Vérifiez aussi vos courriers indésirables.', 'ok'); } catch (e) { msg(friendly(e), 'error'); }
    cooldown();
  });

  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => show(b.dataset.mode)));
  document.addEventListener('input', (e) => { const f = e.target.closest && e.target.closest('.field.invalid'); if (f) f.classList.remove('invalid'); });
  document.addEventListener('click', (e) => { // afficher / masquer le mot de passe
    const t = e.target.closest('.pw-toggle'); if (!t) return; const input = t.parentElement.querySelector('input');
    const showing = input.type === 'password'; input.type = showing ? 'text' : 'password'; t.textContent = showing ? 'Masquer' : 'Afficher'; t.setAttribute('aria-pressed', showing);
  });
  // Indicateur de robustesse du mot de passe (indicatif ; le minimum de 8 caractères reste imposé)
  const LEVELS = ['', 'Faible', 'Moyen', 'Bon', 'Excellent'];
  $('#s-pass').addEventListener('input', (e) => {
    const p = e.target.value; let s = 0;
    if (p.length >= 8) s += 1; if (p.length >= 12) s += 1; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s += 1; if (/\d/.test(p)) s += 1; if (/[^A-Za-z0-9]/.test(p)) s += 1;
    s = !p ? 0 : p.length < 8 ? 1 : Math.min(4, Math.max(2, s));
    $('#pwMeter').dataset.score = s;
    $('#pwHint').textContent = s ? 'Sécurité du mot de passe : ' + LEVELS[s] + (p.length < 8 ? ' (8 caractères minimum)' : '') : 'Utilisez au moins 8 caractères. Mélangez lettres, chiffres et symboles pour plus de sécurité.';
  });

  $('#form-login').addEventListener('submit', (e) => { e.preventDefault(); const f = e.currentTarget; const v = new FormData(f);
    const email = String(v.get('email') || '').trim(), password = String(v.get('password') || '');
    if (!EMAIL.test(email)) return invalid(f, 'email', 'Saisissez votre adresse e-mail et votre mot de passe.');
    if (!password) return invalid(f, 'password', 'Saisissez votre adresse e-mail et votre mot de passe.');
    clearInvalid();
    busy(f, async () => { const { error } = await db.auth.signInWithPassword({ email, password }); if (error) return msg(friendly(error), 'error'); msg('Connexion réussie. Redirection…', 'ok'); go(); }); });

  $('#form-signup').addEventListener('submit', (e) => { e.preventDefault(); const f = e.currentTarget; const v = new FormData(f);
    if (v.get('website')) return done('Vérifiez votre boîte e-mail', 'Nous avons envoyé un lien de confirmation. Ouvrez-le pour activer votre compte.', null); // robot : on fait semblant, sans rien envoyer
    const name = String(v.get('name') || '').trim(), email = String(v.get('email') || '').trim(), password = String(v.get('password') || '');
    if (name.length < 2) return invalid(f, 'name', 'Saisissez votre nom complet.');
    if (!EMAIL.test(email)) return invalid(f, 'email', 'Saisissez une adresse e-mail valide.');
    if (password.length < 8) return invalid(f, 'password', 'Le mot de passe doit contenir au moins 8 caractères.');
    if (password !== v.get('confirm')) return invalid(f, 'confirm', 'Les deux mots de passe ne sont pas identiques.');
    clearInvalid();
    busy(f, async () => {
      const redirect = location.origin + '/compte.html';
      const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: redirect, data: { full_name: name } } });
      if (error) return msg(friendly(error), 'error');
      if (data && data.session) return go();
      // Même écran que l'adresse existe déjà ou non : on ne révèle pas quelles adresses ont un compte.
      done('Vérifiez votre boîte e-mail', 'Nous avons envoyé un lien de confirmation à <b>' + esc(email) + '</b>. Ouvrez-le pour activer votre compte, puis connectez-vous. Pensez à vérifier vos courriers indésirables.',
        () => db.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect } }));
      f.reset(); $('#pwMeter').dataset.score = 0;
    }); });

  $('#form-forgot').addEventListener('submit', (e) => { e.preventDefault(); const f = e.currentTarget; const email = String(new FormData(f).get('email') || '').trim();
    if (!EMAIL.test(email)) return invalid(f, 'email', 'Saisissez une adresse e-mail valide.');
    clearInvalid();
    const send = () => db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/connexion.html' });
    busy(f, async () => { const { error } = await send();
      if (error && ((error.status === 429) || /rate limit|too many|security purposes/i.test(error.message || ''))) return msg(friendly(error), 'error');
      done('Consultez votre boîte e-mail', 'Si un compte existe avec l’adresse <b>' + esc(email) + '</b>, un lien de réinitialisation vient de lui être envoyé. Il reste valable peu de temps.', send); }); });

  $('#form-reset').addEventListener('submit', (e) => { e.preventDefault(); const f = e.currentTarget; const v = new FormData(f); const password = String(v.get('password') || '');
    if (password.length < 8) return invalid(f, 'password', 'Le mot de passe doit contenir au moins 8 caractères.');
    if (password !== v.get('confirm')) return invalid(f, 'confirm', 'Les deux mots de passe ne sont pas identiques.');
    clearInvalid();
    busy(f, async () => { const { error } = await db.auth.updateUser({ password }); if (error) return msg(friendly(error), 'error');
      msg('Mot de passe modifié. Redirection…', 'ok'); setTimeout(go, 800); }); });

  (async () => {
    if (!db || !cfg.SUPABASE_URL) { MODES.forEach((m) => { $('#form-' + m).hidden = true; }); $('#authTabs').hidden = true; return msg('Service de connexion indisponible. Vérifiez votre connexion Internet puis actualisez.', 'error'); }
    const recovery = /type=recovery/.test(location.hash);
    const maybeRecovery = /[?&](code|token_hash)=/.test(location.search); // lien reçu par e-mail (récupération ou confirmation)
    let recovering = false;
    db.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') { recovering = true; show('reset'); } });
    if (recovery) { show('reset'); return; }
    try {
      const { data } = await db.auth.getSession();
      if (data && data.session) { if (maybeRecovery) setTimeout(() => { if (!recovering) go(); }, 1500); else go(); }
    } catch (e) { /* on reste sur le formulaire */ }
  })();
})();
