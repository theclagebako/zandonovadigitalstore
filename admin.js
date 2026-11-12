(() => {
const cfg=window.ZANDO_CONFIG||{};const db=window.supabase?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY):null;const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let cats=[],products=[];
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
function slugify(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function coverUrl(path){return path?db.storage.from('zandonova-covers').getPublicUrl(path).data.publicUrl:null}
function money(u,c){return '$'+Number(u).toFixed(2)+' · '+new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(c))+' FC'}
function showDashboard(){ $('#loginPanel').hidden=true;$('#dashboard').hidden=false;loadAll() }
async function checkSession(){if(!db){$('#loginMessage').textContent='Supabase ne s’est pas chargé. Vérifiez Internet puis actualisez.';return}const {data:{session}}=await db.auth.getSession();if(!session)return;const {data,error}=await db.from('zando_admins').select('user_id').eq('user_id',session.user.id).maybeSingle();if(error||!data){await db.auth.signOut();$('#loginMessage').textContent='Ce compte ne dispose pas des droits administrateur.';return}showDashboard()}
async function loadAll(){await loadCategories();await loadProducts();await loadOrders()}
async function loadCategories(){const {data,error}=await db.from('zando_categories').select('*').order('sort_order');if(error){toast(error.message);return}cats=data||[];$('#productCategory').innerHTML=cats.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')}
async function loadProducts(){const {data,error}=await db.from('zando_products').select('*').order('created_at',{ascending:false});if(error){toast(error.message);return}products=data||[];$('#productAdminList').innerHTML=products.length?products.map(p=>{const img=coverUrl(p.cover_path);return '<div class="admin-row"><div class="admin-thumb">'+(img?'<img src="'+esc(img)+'" alt="">':'Z.')+'</div><div><b>'+esc(p.title)+'</b><small>'+money(p.price_usd,p.price_cdf)+' · '+(p.is_published?'Publié':'Brouillon')+' · '+(p.file_path?'PDF prêt':'PDF manquant')+'</small></div><div class="admin-row-actions"><span class="status-pill '+(p.is_published?'paid':'pending')+'">'+(p.is_published?'En ligne':'Brouillon')+'</span><button class="mini-btn" data-edit="'+p.id+'">Modifier</button></div></div>'}).join(''):'<div class="empty-admin">Aucun ebook pour le moment. Ajoutez votre premier produit.</div>'}
function resetProductForm(){const f=$('#productForm');f.reset();f.elements.id.value='';$('#productFormTitle').textContent='Nouvel ebook';f.hidden=true}
function editProduct(id){const p=products.find(x=>x.id===id);if(!p)return;const f=$('#productForm');f.elements.id.value=p.id;f.elements.title.value=p.title;f.elements.category.value=p.category_id||'';f.elements.short_description.value=p.short_description||'';f.elements.description.value=p.description||'';f.elements.price_usd.value=p.price_usd;f.elements.price_cdf.value=p.price_cdf;f.elements.featured.checked=p.is_featured;f.elements.published.checked=p.is_published;f.elements.cover.value='';f.elements.ebook.value='';$('#productFormTitle').textContent='Modifier : '+p.title;f.hidden=false;f.scrollIntoView({behavior:'smooth',block:'center'})}
async function uploadFile(bucket,file){const ext=file.name.split('.').pop().toLowerCase();const path=crypto.randomUUID()+'.'+ext;const {error}=await db.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;return path}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget),msg=$('#loginMessage'),btn=e.currentTarget.querySelector('button[type=submit]');msg.textContent='Connexion…';btn.disabled=true;try{if(!db)throw new Error('Supabase ne s’est pas chargé. Vérifiez config.js et votre connexion Internet.');const {data,error}=await db.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error)throw error;const {data:member,error:memberError}=await db.from('zando_admins').select('user_id').eq('user_id',data.user.id).maybeSingle();if(memberError)throw memberError;if(!member){await db.auth.signOut();throw new Error('Ce compte ne dispose pas des droits administrateur.')}showDashboard()}catch(err){console.error('Admin login:',err);msg.textContent='Connexion impossible : '+(err.message||'Erreur inconnue.')}finally{btn.disabled=false}});
$('#logoutButton').onclick=async()=>{await db.auth.signOut();location.reload()};
$('#newProductButton').onclick=()=>{resetProductForm();$('#productForm').hidden=false;$('#productForm').scrollIntoView({behavior:'smooth',block:'center'})};
$('#cancelProduct').onclick=resetProductForm;
$('#productAdminList').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)editProduct(b.dataset.edit)});
$('#productForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);const id=f.get('id');const old=products.find(p=>p.id===id);const btn=$('#saveProduct');btn.disabled=true;btn.textContent='Enregistrement…';try{let cover=old?.cover_path||null,file=old?.file_path||null;const coverFile=form.elements.cover.files[0],pdf=form.elements.ebook.files[0];if(coverFile){if(coverFile.size>5*1024*1024)throw new Error('La couverture doit faire 5 Mo maximum.');cover=await uploadFile('zandonova-covers',coverFile)}if(pdf){if(pdf.size>20*1024*1024)throw new Error('Le PDF doit faire 20 Mo maximum.');file=await uploadFile('zandonova-ebooks',pdf)}const title=String(f.get('title')).trim();const payload={title,slug:old?.slug||slugify(title)+'-'+crypto.randomUUID().slice(0,6),category_id:f.get('category')||null,short_description:String(f.get('short_description')||'').trim(),description:String(f.get('description')||'').trim(),price_usd:Number(f.get('price_usd')),price_cdf:Number(f.get('price_cdf')),cover_path:cover,file_path:file,is_featured:form.elements.featured.checked,is_published:form.elements.published.checked&&!!file,updated_at:new Date().toISOString()};if(payload.is_published&&(!file||payload.price_usd<=0||payload.price_cdf<=0))throw new Error('Ajoutez le PDF et définissez des prix USD et CDF supérieurs à zéro avant publication.');let result;if(id)result=await db.from('zando_products').update(payload).eq('id',id);else result=await db.from('zando_products').insert(payload);if(result.error)throw result.error;toast('Ebook enregistré.');resetProductForm();await loadProducts()}catch(err){console.error(err);toast(err.message||'Erreur pendant l’enregistrement.')}finally{btn.disabled=false;btn.textContent='Enregistrer l’ebook →'}});
const STATUS_LABEL={pending:'En attente',payment_review:'Paiement à vérifier',paid:'Payée',delivered:'Livrée',cancelled:'Annulée'};
let itemsByOrder={},accessByOrder={},freshLinks={};
const waLink=(phone,text)=>'https://wa.me/'+String(phone||'').replace(/\D/g,'')+'?text='+encodeURIComponent(text);
const downloadUrl=(orderId,token)=>location.origin+'/telecharger.html#o='+orderId+'&t='+token;
const isMissingTable=e=>!!e&&(e.code==='42P01'||e.code==='PGRST205'||/does not exist|schema cache/i.test(e.message||''));
function dateFr(d){return new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}
function orderCard(o){
  const items=(itemsByOrder[o.id]||[]).map(x=>esc(x.product_title)+' ×'+x.quantity).join(', ')||'—';
  const acc=accessByOrder[o.id],fresh=freshLinks[o.id];
  const canConfirm=o.status==='pending'||o.status==='payment_review';
  const canDeliver=o.status==='paid'||o.status==='delivered';
  let box='';
  if(canConfirm){
    box='<div class="order-box"><h4>1 · Vérifier le paiement Mobile Money</h4><div class="row"><input name="ref" placeholder="Référence de la transaction" maxlength="80" autocomplete="off"><input name="amount" type="number" min="0" step="0.01" placeholder="Montant reçu ('+esc(o.currency)+')"></div><div class="row"><button class="mini-btn primary" data-action="confirm" data-id="'+o.id+'">Confirmer le paiement</button><small>Attendu : '+money(o.total_usd,o.total_cdf)+'. Vérifiez le transfert dans votre application avant de confirmer.</small></div></div>';
  }
  if(canDeliver){
    box='<div class="order-box"><h4>Paiement confirmé'+(o.payment_reference?' · réf. '+esc(o.payment_reference):'')+(o.amount_received?' · '+esc(o.amount_received)+' '+esc(o.currency):'')+'</h4>';
    if(fresh){
      box+='<div class="link-box"><b>Lien de téléchargement (affiché une seule fois)</b><input readonly value="'+esc(fresh.url)+'" onclick="this.select()"><div class="row"><button class="mini-btn primary" data-action="copy" data-id="'+o.id+'">Copier le lien</button><a class="mini-btn primary" target="_blank" rel="noopener" href="'+esc(waLink(o.customer_phone,'Bonjour '+o.customer_name+', votre paiement est confirmé. Voici votre lien de téléchargement sécurisé (valable '+fresh.days+' jours, '+fresh.max+' téléchargements) : '+fresh.url))+'">Envoyer sur WhatsApp</a></div></div>';
    }
    if(acc){box+='<small>Accès actif : '+acc.download_count+'/'+acc.max_downloads+' téléchargement(s) utilisé(s) · expire le '+dateFr(acc.expires_at)+'.</small>'}
    else if(!fresh){box+='<small>Aucun accès actif pour cette commande.</small>'}
    box+='<div class="row"><select name="days" aria-label="Durée"><option value="3">3 jours</option><option value="7" selected>7 jours</option><option value="14">14 jours</option><option value="30">30 jours</option></select><select name="max" aria-label="Nombre de téléchargements"><option value="3">3 téléchargements</option><option value="5" selected>5 téléchargements</option><option value="10">10 téléchargements</option></select><button class="mini-btn primary" data-action="authorize" data-id="'+o.id+'">'+(acc||fresh?'Régénérer le lien':'Autoriser le téléchargement')+'</button>'+(acc?'<button class="mini-btn danger" data-action="revoke" data-id="'+o.id+'">Révoquer</button>':'')+'<button class="mini-btn" data-action="quick" data-id="'+o.id+'" title="Liens directs valables 1 heure (secours)">Secours 1 h</button></div></div>';
  }
  const statusControl=canConfirm||o.status==='cancelled'
    ?'<select data-status="'+o.id+'" aria-label="Statut de la commande"><option value="pending"'+(o.status==='pending'?' selected':'')+'>En attente</option><option value="payment_review"'+(o.status==='payment_review'?' selected':'')+'>Paiement à vérifier</option><option value="cancelled"'+(o.status==='cancelled'?' selected':'')+'>Annulée</option></select>'
    :'';
  return '<div class="admin-row admin-order" data-order="'+o.id+'"><div><b>'+esc(o.customer_name)+' · '+esc(o.customer_phone)+'</b><div class="order-meta"><small>'+esc(o.customer_city)+'</small><small>'+new Date(o.created_at).toLocaleString('fr-FR')+'</small><small>'+money(o.total_usd,o.total_cdf)+'</small><small>'+esc(o.payment_method)+' / '+esc(o.currency)+'</small></div><small>'+items+'</small><small>Réf. '+esc(o.id)+'</small>'+box+'</div><div class="admin-row-actions"><span class="status-pill '+(o.status==='paid'||o.status==='delivered'?'paid':o.status==='pending'?'pending':'')+'">'+esc(STATUS_LABEL[o.status]||o.status)+'</span>'+statusControl+'</div></div>';
}
async function loadOrders(){
  const {data,error}=await db.from('zando_orders').select('*').order('created_at',{ascending:false}).limit(100);
  if(error){toast(error.message);return}
  const orders=data||[],ids=orders.map(o=>o.id);
  itemsByOrder={};accessByOrder={};$('#accessWarning').hidden=true;
  if(ids.length){
    const it=await db.from('zando_order_items').select('order_id,product_title,quantity').in('order_id',ids);
    if(!it.error)(it.data||[]).forEach(x=>(itemsByOrder[x.order_id]=itemsByOrder[x.order_id]||[]).push(x));
    const ac=await db.from('zando_download_access').select('order_id,expires_at,max_downloads,download_count,revoked_at').in('order_id',ids).is('revoked_at',null);
    if(ac.error){if(isMissingTable(ac.error))$('#accessWarning').hidden=false;else toast(ac.error.message)}
    else(ac.data||[]).forEach(a=>{accessByOrder[a.order_id]=a});
  }
  $('#pendingCount').textContent=orders.filter(o=>o.status==='pending'||o.status==='payment_review').length;
  $('#ordersList').innerHTML=orders.length?orders.map(orderCard).join(''):'<div class="empty-admin">Aucune commande reçue pour le moment.</div>';
}
$('#ordersList').addEventListener('change',async e=>{
  const s=e.target.closest('[data-status]');if(!s)return;
  const {error}=await db.from('zando_orders').update({status:s.value,updated_at:new Date().toISOString()}).eq('id',s.dataset.status);
  if(error){toast(error.message);loadOrders();return}
  toast('Statut de commande mis à jour.');loadOrders();
});
$('#ordersList').addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  const id=b.dataset.id,card=b.closest('[data-order]'),act=b.dataset.action;
  try{
    if(act==='confirm'){
      const ref=card.querySelector('[name=ref]').value,amount=Number(card.querySelector('[name=amount]').value);
      if(!ref.trim()||!(amount>0))throw new Error('Saisissez la référence de la transaction et le montant reçu.');
      b.disabled=true;const {error}=await db.rpc('zando_admin_confirm_payment',{p_order_id:id,p_reference:ref,p_amount:amount});
      if(error)throw error;toast('Paiement confirmé. Vous pouvez autoriser le téléchargement.');await loadOrders();
    }else if(act==='authorize'){
      const days=Number(card.querySelector('[name=days]').value),max=Number(card.querySelector('[name=max]').value);
      b.disabled=true;const {data:token,error}=await db.rpc('zando_admin_authorize_download',{p_order_id:id,p_days:days,p_max:max});
      if(error)throw error;freshLinks[id]={url:downloadUrl(id,token),days,max};toast('Lien généré. Envoyez-le au client.');await loadOrders();
    }else if(act==='revoke'){
      if(!confirm('Révoquer l’accès au téléchargement de cette commande ?'))return;
      b.disabled=true;const {error}=await db.rpc('zando_admin_revoke_download',{p_order_id:id});
      if(error)throw error;delete freshLinks[id];toast('Accès révoqué.');await loadOrders();
    }else if(act==='copy'){
      await navigator.clipboard.writeText(freshLinks[id].url);toast('Lien copié.');
    }else if(act==='quick'){
      const {data:order,error:oe}=await db.from('zando_orders').select('status').eq('id',id).single();if(oe)throw oe;
      if(!['paid','delivered'].includes(order.status))throw new Error('Confirmez le paiement avant de générer les liens de livraison.');
      const {data:items,error}=await db.from('zando_order_items').select('product_id,product_title').eq('order_id',id);if(error)throw error;
      const pids=[...new Set((items||[]).map(x=>x.product_id).filter(Boolean))];if(!pids.length)throw new Error('Aucun fichier associé à cette commande.');
      const {data:ps,error:pe}=await db.from('zando_products').select('id,file_path,title').in('id',pids);if(pe)throw pe;
      const links=[];for(const p of ps||[]){if(!p.file_path)continue;const {data,error:se}=await db.storage.from('zandonova-ebooks').createSignedUrl(p.file_path,3600);if(se)throw se;links.push(p.title+' : '+data.signedUrl)}
      if(!links.length)throw new Error('Aucun PDF disponible.');await navigator.clipboard.writeText(links.join('\n'));toast('Lien(s) direct(s) copié(s), valables 1 heure.');
    }
  }catch(err){console.error(err);toast(err.message||'Action impossible.');b.disabled=false}
});

/* Gestion sécurisée des utilisateurs */
let managedUsers=[];
let selectedUserId=null;
const userIsSuspended=u=>!!u.banned_until&&new Date(u.banned_until).getTime()>Date.now();
async function userAdminCall(payload){
 if(!db)throw new Error('Supabase ne s’est pas chargé. Actualisez la page.');
 const {data,error}=await db.functions.invoke('zando-user-admin',{body:payload});
 if(error)throw new Error(error.message||'Service de gestion des utilisateurs indisponible.');
 if(!data||!data.ok)throw new Error(data?.error||'Opération impossible.');
 return data;
}
function renderUsers(){
 const q=($('#userSearch')?.value||'').trim().toLowerCase(),f=$('#userFilter')?.value||'all';
 const rows=managedUsers.filter(u=>{
  const match=!q||[u.email,u.name,u.id].some(x=>String(x||'').toLowerCase().includes(q));
  const suspended=userIsSuspended(u);
  const filter=f==='all'||(f==='active'&&!suspended)||(f==='suspended'&&suspended)||(f==='admins'&&u.is_admin);
  return match&&filter;
 });
 $('#usersCount').textContent=String(managedUsers.length);
 $('#usersList').innerHTML=rows.length?rows.map(u=>{
  const suspended=userIsSuspended(u);
  return '<div class="admin-row user-row"><div><b>'+esc(u.name||'Client sans nom')+'</b><small>'+esc(u.email||'Adresse e-mail inconnue')+'</small><small>Inscrit le '+(u.created_at?dateFr(u.created_at):'—')+' · '+(u.last_sign_in_at?'Dernière connexion : '+dateFr(u.last_sign_in_at):'Jamais connecté')+'</small></div><div class="admin-row-actions"><span class="status-pill '+(u.is_admin?'paid':suspended?'pending':'')+'">'+(u.is_admin?'Administrateur':suspended?'Suspendu':'Actif')+'</span><button class="mini-btn" data-user-action="details" data-id="'+u.id+'">Détails</button><button class="mini-btn" data-user-action="status" data-id="'+u.id+'">'+(suspended?'Réactiver':'Suspendre')+'</button><button class="mini-btn" data-user-action="admin" data-id="'+u.id+'">'+(u.is_admin?'Retirer admin':'Promouvoir admin')+'</button><button class="mini-btn danger" data-user-action="delete" data-id="'+u.id+'">Supprimer</button></div></div>';
 }).join(''):'<div class="empty-admin">Aucun utilisateur correspondant.</div>';
}
async function loadUsers(){
 const msg=$('#usersMessage');msg.textContent='Chargement des utilisateurs…';
 $('#usersList').innerHTML='<div class="empty-admin">Chargement…</div>';
 try{
  managedUsers=[];let page=1,hasMore=true;
  while(hasMore&&page<=50){const data=await userAdminCall({action:'list_users',page});managedUsers.push(...(data.users||[]));hasMore=!!data.has_more;page++;}
  renderUsers();
  msg.textContent='Liste actualisée : '+managedUsers.length+' compte(s).'+(hasMore?' Affichage limité aux 5 000 premiers comptes.':'');
 }catch(e){msg.textContent=e.message;$('#usersList').innerHTML='<div class="empty-admin">Impossible de charger les utilisateurs.</div>'}
}
async function showUserDetails(id){
 const panel=$('#userDetails');panel.hidden=false;panel.innerHTML='<p>Chargement du profil et des commandes…</p>';selectedUserId=id;
 try{
  const data=await userAdminCall({action:'user_details',user_id:id}),u=data.user,orders=data.orders||[];
  panel.innerHTML='<div class="editor-heading"><h3>Détails du compte</h3><button type="button" class="mini-btn" id="closeUserDetails">Fermer</button></div><p><b>'+esc(u.name||'Client sans nom')+'</b><br>'+esc(u.email)+'<br><small>Créé le '+dateFr(u.created_at)+' · Dernière connexion : '+(u.last_sign_in_at?dateFr(u.last_sign_in_at):'jamais')+'</small></p><h4>Historique des commandes ('+orders.length+')</h4>'+(orders.length?orders.map(o=>'<div class="user-order"><b>'+esc(o.status)+' · '+money(o.total_usd,o.total_cdf)+'</b><small>'+dateFr(o.created_at)+' · '+(o.items||[]).map(i=>esc(i.product_title)+' ×'+i.quantity).join(', ')+'</small></div>').join(''):'<p>Aucune commande associée à ce compte.</p>');
  $('#closeUserDetails').onclick=()=>{panel.hidden=true;panel.innerHTML=''};
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
 }catch(e){panel.innerHTML='<p class="form-note">'+esc(e.message)+'</p>'}
}
$('#usersList').addEventListener('click',async e=>{
 const b=e.target.closest('[data-user-action]');if(!b)return;
 const u=managedUsers.find(x=>x.id===b.dataset.id);if(!u)return;
 const id=u.id,act=b.dataset.userAction;b.disabled=true;
 try{
  if(act==='details'){await showUserDetails(id);return}
  if(act==='status'){
   const suspended=userIsSuspended(u);
   if(!confirm((suspended?'Réactiver':'Suspendre')+' le compte '+u.email+' ?'))return;
   await userAdminCall({action:'set_status',user_id:id,status:suspended?'active':'suspended'});
   $('#usersMessage').textContent='Statut du compte mis à jour.';
  }else if(act==='admin'){
   const enable=!u.is_admin;
   if(!confirm((enable?'Accorder les droits administrateur à ':'Retirer les droits administrateur de ')+u.email+' ?'))return;
   await userAdminCall({action:'set_admin',user_id:id,enabled:enable});
   $('#usersMessage').textContent='Droits administrateur mis à jour.';
  }else if(act==='delete'){
   if(!confirm('Suppression définitive du compte '+u.email+' ? Les commandes seront conservées et dissociées du compte.'))return;
   const typed=prompt('Pour confirmer, saisissez exactement l’adresse e-mail : '+u.email);
   if(typed===null)return;
   await userAdminCall({action:'delete_user',user_id:id,confirm_email:typed});
   $('#usersMessage').textContent='Compte supprimé. Les commandes historiques sont conservées.';
  }
  await loadUsers();
 }catch(err){$('#usersMessage').textContent=err.message}
 finally{b.disabled=false}
});
$('#userSearch').addEventListener('input',renderUsers);
$('#userFilter').addEventListener('change',renderUsers);
$('#refreshUsers').addEventListener('click',loadUsers);
$('#exportUsers').addEventListener('click',()=>{
 const rows=[['ID','Nom','E-mail','Inscription','Dernière connexion','Administrateur','Suspendu'],...managedUsers.map(u=>[u.id,u.name,u.email,u.created_at,u.last_sign_in_at,u.is_admin?'Oui':'Non',userIsSuspended(u)?'Oui':'Non'])];
 const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download='zandonova-utilisateurs.csv';a.click();URL.revokeObjectURL(url);
});

document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('#productsPanel').hidden=b.dataset.tab!=='products';$('#ordersPanel').hidden=b.dataset.tab!=='orders';$('#usersPanel').hidden=b.dataset.tab!=='users';if(b.dataset.tab==='orders')loadOrders();if(b.dataset.tab==='users')loadUsers()}));$('#refreshOrders').onclick=loadOrders;
checkSession();
})();