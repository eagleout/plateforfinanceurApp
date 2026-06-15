/* =====================================================================
   Plateforme Financement — logique applicative (production / Supabase)
   Dépend de : @supabase/supabase-js (CDN) + assets/supabase-config.js
   ===================================================================== */

/* ---------------------------------------------------------------------
   0. Client Supabase
   ------------------------------------------------------------------- */
const SB_READY = !!(window.SUPABASE_URL
  && window.SUPABASE_ANON_KEY
  && !String(window.SUPABASE_URL).includes('VOTRE-PROJET'));

const sb = SB_READY
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

/* État global minimal en mémoire */
const app = {
  session: null,
  profile: null,      // { role, full_name, ... }
  role: null,         // 'client' | 'consultant'
  deals: [],          // consultant : tous ; client : son dossier
  currentDeal: null,  // dossier affiché
  channels: []        // souscriptions realtime
};

/* ---------------------------------------------------------------------
   1. Référentiels métier
   ------------------------------------------------------------------- */
const STATUSES = [
  { id: 'new',      label: 'Nouveau',                 cls: 's-new',      step: 1 },
  { id: 'pieces',   label: 'Pièces en attente',       cls: 's-pieces',   step: 2 },
  { id: 'complete', label: 'Dossier complet',         cls: 's-complete', step: 3 },
  { id: 'instruct', label: 'En instruction',          cls: 's-instruct', step: 4 },
  { id: 'present',  label: 'Présenté aux financeurs', cls: 's-present',  step: 5 },
  { id: 'offer',    label: 'Offre(s) reçue(s)',       cls: 's-offer',    step: 6 },
  { id: 'closing',  label: 'En closing',              cls: 's-closing',  step: 7 },
  { id: 'won',      label: 'Gagné',                   cls: 's-won',      step: 8 },
  { id: 'lost',     label: 'Perdu',                   cls: 's-lost',     step: 0 }
];

const TIMELINE_STEPS = [
  { id: 'new',      title: 'Demande reçue',           desc: 'Votre dossier a été créé suite à votre qualification.' },
  { id: 'pieces',   title: 'Collecte des pièces',     desc: 'Téléversez les documents requis dans votre espace.' },
  { id: 'complete', title: 'Dossier complet',         desc: 'Toutes les pièces sont validées par nos équipes.' },
  { id: 'instruct', title: 'Instruction interne',     desc: 'Modélisation financière et préparation du mémo.' },
  { id: 'present',  title: 'Présentation aux financeurs', desc: 'Votre dossier est envoyé à un panel ciblé.' },
  { id: 'offer',    title: 'Offres reçues',           desc: 'Vous recevez et comparez plusieurs propositions.' },
  { id: 'closing',  title: 'Closing & déblocage',     desc: 'Signature, levée des CP, déblocage des fonds.' },
  { id: 'won',      title: 'Opération finalisée',     desc: 'Fonds débloqués. Suivi post-closing actif.' }
];

function getRequiredDocs(scenario){
  const base = [
    { doc_key: 'bilan',  name: 'Dernier bilan',                 description: 'Bilan et compte de résultat de l\'exercice clos.' },
    { doc_key: 'kbis',   name: 'Extrait K-bis',                 description: 'Daté de moins de 3 mois.' },
    { doc_key: 'relevs', name: '3 derniers relevés de compte',  description: 'Comptes professionnels principaux.' }
  ];
  if(scenario === 'invest_immo' || scenario === 'invest_rachat'){
    base.push({ doc_key: 'statuts', name: 'Statuts de la société', description: 'Statuts à jour signés.' });
  }
  return base;
}

/* ---------------------------------------------------------------------
   2. Arbre de qualification (public, côté prospect)
   ------------------------------------------------------------------- */
const tree = {
  start: {
    label: 'Étape 1 — Besoin', step: 1,
    question: 'De quel type de financement avez-vous besoin ?',
    hint: 'Sélectionnez le besoin principal de votre entreprise.',
    options: [
      { label: 'Financement d\'investissement',         next: 'inv_bilan',  meta: { besoin: 'Investissement' } },
      { label: 'Financement trésorerie / Stock / BFR',  next: 'tre_bilan',  meta: { besoin: 'Trésorerie / BFR' } }
    ]
  },
  inv_bilan: {
    label: 'Étape 2 — Bilan', step: 2,
    question: 'Avez-vous au moins un bilan clôturé ?',
    options: [ { label: 'Oui', next: 'inv_ca' }, { label: 'Non', next: 'ko_bilan' } ]
  },
  inv_ca: {
    label: 'Étape 3 — Chiffre d\'affaires', step: 3,
    question: 'Votre chiffre d\'affaires est-il supérieur à 500 000 € ?',
    options: [ { label: 'Oui', next: 'inv_resultat' }, { label: 'Non', next: 'ko_ca' } ]
  },
  inv_resultat: {
    label: 'Étape 4 — Résultat net', step: 4,
    question: 'Votre résultat net est-il positif ?',
    options: [ { label: 'Oui', next: 'inv_fp' }, { label: 'Non', next: 'ko_rn' } ]
  },
  inv_fp: {
    label: 'Étape 5 — Fonds propres', step: 5,
    question: 'Vos fonds propres sont-ils positifs ?',
    options: [ { label: 'Oui', next: 'inv_quoi' }, { label: 'Non', next: 'ko_fp' } ]
  },
  inv_quoi: {
    label: 'Étape 6 — Objet du financement', step: 6,
    question: 'Que souhaitez-vous financer ?',
    options: [
      { label: 'Immobilier',                                 next: 'identity', meta: { objet: 'Immobilier', scenario: 'invest_immo' } },
      { label: 'Rachat d\'entreprise / Fonds de commerce',   next: 'identity', meta: { objet: 'Rachat',     scenario: 'invest_rachat' } },
      { label: 'Matériel / Équipement',                      next: 'identity', meta: { objet: 'Matériel',   scenario: 'invest_materiel' } },
      { label: 'Autre besoin',                               next: 'identity', meta: { objet: 'Autre',      scenario: 'invest_autre' } }
    ]
  },
  tre_bilan: {
    label: 'Étape 2 — Bilan', step: 2,
    question: 'Avez-vous au moins un bilan clôturé ?',
    options: [ { label: 'Oui', next: 'tre_ca' }, { label: 'Non', next: 'tre_clients' } ]
  },
  tre_clients: {
    label: 'Étape 3 — Clientèle', step: 3,
    question: 'Quel est votre type de clientèle principal ?',
    options: [ { label: 'Particuliers (B2C)', next: 'ko_b2c' }, { label: 'Professionnels / entreprises', next: 'tre_soucis' } ]
  },
  tre_soucis: {
    label: 'Étape 4 — Santé bancaire', step: 4,
    question: 'Avez-vous eu des difficultés sur vos comptes ces 3 derniers mois ?',
    hint: 'Rejets, dépassements de découvert, interdits bancaires…',
    options: [ { label: 'Non, aucune', next: 'tre_ca_sansbilan' }, { label: 'Oui', next: 'ko_soucis' } ]
  },
  tre_ca_sansbilan: {
    label: 'Étape 5 — Chiffre d\'affaires', step: 5,
    question: 'Votre chiffre d\'affaires est-il supérieur à 800 000 € ?',
    options: [ { label: 'Oui', next: 'tre_suivi' }, { label: 'Non', next: 'ko_ca800' } ]
  },
  tre_suivi: {
    label: 'Étape 6 — Accompagnement', step: 6,
    question: 'Souhaitez-vous bénéficier d\'un accompagnement et d\'un suivi de gestion régulier ?',
    options: [ { label: 'Oui', next: 'identity', meta: { scenario: 'tre_sansbilan' } }, { label: 'Non', next: 'ko_suivi' } ]
  },
  tre_ca: {
    label: 'Étape 3 — Chiffre d\'affaires', step: 3,
    question: 'Votre chiffre d\'affaires est-il supérieur à 900 000 € ?',
    options: [ { label: 'Oui', next: 'tre_lignes' }, { label: 'Non', next: 'tre_fp_alt' } ]
  },
  tre_fp_alt: {
    label: 'Étape 4 — Fonds propres', step: 4,
    question: 'Vos fonds propres sont-ils positifs ?',
    options: [ { label: 'Oui', next: 'tre_rn_alt' }, { label: 'Non', next: 'ko_fp' } ]
  },
  tre_rn_alt: {
    label: 'Étape 5 — Résultat net', step: 5,
    question: 'Votre résultat net est-il positif ?',
    options: [ { label: 'Oui', next: 'identity', meta: { scenario: 'tre_petite' } }, { label: 'Non', next: 'ko_rn' } ]
  },
  tre_lignes: {
    label: 'Étape 4 — Lignes en place', step: 4,
    question: 'Disposez-vous déjà de lignes court terme ?',
    hint: 'Découvert, Dailly, escompte, affacturage…',
    options: [
      { label: 'Oui', next: 'tre_choix', meta: { scenario: 'tre_grande_lignes' } },
      { label: 'Non', next: 'identity',  meta: { scenario: 'tre_grande_neuve' } }
    ]
  },
  tre_choix: {
    label: 'Étape 5 — Solutions', step: 5,
    question: 'Quelles solutions souhaitez-vous explorer ?',
    hint: 'Plusieurs choix possibles. Notre consultant affinera avec vous.',
    options: [
      { label: 'Découvert structuré',          next: 'identity', meta: { solution: 'Découvert' } },
      { label: 'Dailly (cession de créances)', next: 'identity', meta: { solution: 'Dailly' } },
      { label: 'Escompte commercial',          next: 'identity', meta: { solution: 'Escompte' } },
      { label: 'Affacturage',                  next: 'identity', meta: { solution: 'Affacturage' } }
    ]
  },
  identity: {
    label: 'Dernière étape — Vous', step: 7,
    question: 'Parfait, vous êtes éligible. Créez votre espace.',
    hint: 'Un consultant vous recontacte sous 48h.',
    custom: 'identity'
  },
  ko_bilan:  { ko: true, title: 'Premier bilan requis',    reason: 'Notre dispositif nécessite au minimum un bilan clôturé pour évaluer la solvabilité de votre structure.' },
  ko_ca:     { ko: true, title: 'Critères CA non atteints', reason: 'Notre périmètre actuel cible des entreprises au-delà d\'un seuil de chiffre d\'affaires qui n\'est pas atteint.' },
  ko_rn:     { ko: true, title: 'Rentabilité requise',     reason: 'Un résultat net positif sur le dernier exercice est nécessaire pour rendre votre dossier finançable dans les meilleures conditions.' },
  ko_fp:     { ko: true, title: 'Fonds propres à reconstituer', reason: 'Des fonds propres positifs sont une exigence quasi-systématique des financeurs. Une recapitalisation préalable serait nécessaire.' },
  ko_b2c:    { ko: true, title: 'Cible non couverte',      reason: 'Notre plateforme est dédiée aux entreprises ayant une clientèle B2B. Nous ne couvrons pas actuellement les activités exclusivement B2C.' },
  ko_soucis: { ko: true, title: 'Situation bancaire fragile', reason: 'Les difficultés bancaires récentes rendent l\'accès à de nouveaux financeurs très compromis à court terme.' },
  ko_ca800:  { ko: true, title: 'Critères CA non atteints', reason: 'Sans bilan clôturé, notre seuil minimum de chiffre d\'affaires n\'est pas atteint.' },
  ko_suivi:  { ko: true, title: 'Accompagnement requis',   reason: 'Sans bilan disponible, un suivi de gestion régulier est indispensable pour rendre votre dossier finançable.' }
};

let path = [];
let answers = {};
let currentNode = 'start';

/* ---------------------------------------------------------------------
   3. Rendu de l'arbre de qualification
   ------------------------------------------------------------------- */
function renderNode(nodeId){
  const node = tree[nodeId];
  const content = document.getElementById('q-content');
  if(!node || !content) return;

  if(node.step){
    document.getElementById('q-label').textContent = node.label;
    document.getElementById('q-curr').textContent = node.step;
    document.getElementById('q-bar-fill').style.width = (node.step / 8) * 100 + '%';
  }

  if(node.ko){
    document.getElementById('q-bar-fill').style.width = '100%';
    document.getElementById('q-label').textContent = 'Résultat';
    document.getElementById('q-curr').textContent = '8';
    content.innerHTML = `
      <div class="q-result ko q-step-card">
        <div class="q-result-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h3>${node.title}</h3>
        <p>${node.reason}</p>
        <p style="font-size:13px;color:var(--muted);margin-top:14px">
          Votre situation peut évoluer. Laissez-nous vos coordonnées, et nous reviendrons vers vous dans <b style="color:#C9D0E0">6 mois</b> pour un nouveau diagnostic — sans relance commerciale entre-temps.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="restart()">← Refaire le diagnostic</button>
          <button class="btn btn-primary btn-sm" onclick="askContactKO()">M'inscrire pour un suivi</button>
        </div>
      </div>`;
    return;
  }

  if(node.custom === 'identity'){
    content.innerHTML = `
      <div class="q-step-card">
        <h3 class="q-question">${node.question}</h3>
        <p class="q-hint">${node.hint}</p>
        <div class="q-grid">
          <div class="q-field"><label>Prénom</label><input class="q-input" id="f-firstname" placeholder="Jean" /></div>
          <div class="q-field"><label>Nom</label><input class="q-input" id="f-lastname" placeholder="Dupont" /></div>
        </div>
        <div class="q-field" style="margin-bottom:14px"><label>Société</label><input class="q-input" id="f-society" placeholder="Raison sociale" /></div>
        <div class="q-grid">
          <div class="q-field"><label>Email pro</label><input class="q-input" id="f-email" type="email" placeholder="vous@société.fr" /></div>
          <div class="q-field"><label>Téléphone</label><input class="q-input" id="f-phone" type="tel" placeholder="06 …" /></div>
        </div>
        <div class="q-grid">
          <div class="q-field"><label>Mot de passe</label><input class="q-input" id="f-password" type="password" placeholder="8 caractères min." /></div>
          <div class="q-field"><label>Confirmer</label><input class="q-input" id="f-password2" type="password" placeholder="Répéter" /></div>
        </div>
        <div class="q-field" style="margin:14px 0">
          <label>Montant estimé du financement</label>
          <select class="q-input" id="f-amount">
            <option value="">Sélectionner…</option>
            <option>100 K€ – 500 K€</option>
            <option>500 K€ – 1 M€</option>
            <option>1 M€ – 3 M€</option>
            <option>3 M€ – 10 M€</option>
            <option>+ 10 M€</option>
          </select>
        </div>
        <div id="identity-error" style="display:none;color:var(--red);font-size:13px;margin-bottom:12px"></div>
        <button class="btn btn-primary" id="identity-submit" style="width:100%;justify-content:center;padding:14px" onclick="submitIdentity()">
          Créer mon espace
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
        </button>
        <div class="q-nav">
          <button class="q-back" onclick="back()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg> Précédent</button>
          <span style="font-size:11px;color:var(--muted)">🔒 Données chiffrées</span>
        </div>
      </div>`;
    return;
  }

  let html = `<div class="q-step-card"><h3 class="q-question">${node.question}</h3>${node.hint ? `<p class="q-hint">${node.hint}</p>` : ''}<div class="q-options">`;
  node.options.forEach((opt, i) => {
    html += `<button class="q-opt" onclick="choose('${nodeId}', ${i})"><span class="check"></span>${opt.label}</button>`;
  });
  html += `</div>`;
  if(path.length > 0){
    html += `<div class="q-nav"><button class="q-back" onclick="back()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg> Précédent</button></div>`;
  }
  html += `</div>`;
  content.innerHTML = html;
}

function choose(nodeId, optIndex){
  const opt = tree[nodeId].options[optIndex];
  path.push({ node: nodeId, opt: optIndex });
  if(opt.meta){ Object.assign(answers, opt.meta); }
  currentNode = opt.next;
  renderNode(currentNode);
}
function back(){
  if(path.length === 0) return;
  const last = path.pop();
  currentNode = last.node;
  renderNode(currentNode);
}
function restart(){
  path = []; answers = {}; currentNode = 'start';
  renderNode('start');
}
function askContactKO(){
  alert('Merci. Un conseiller vous recontactera pour un suivi à 6 mois.');
}

function amountToNumber(s){
  if(!s) return 0;
  if(s.includes('100 K')) return 300000;
  if(s.includes('500 K')) return 750000;
  if(s.includes('1 M'))   return 2000000;
  if(s.includes('3 M'))   return 6500000;
  if(s.includes('10 M'))  return 15000000;
  return 0;
}

/* ---------------------------------------------------------------------
   4. Inscription du prospect + création du dossier
   ------------------------------------------------------------------- */
async function submitIdentity(){
  const firstname = val('f-firstname'), lastname = val('f-lastname'),
        society = val('f-society'), email = val('f-email'),
        phone = val('f-phone'), password = val('f-password'),
        password2 = val('f-password2'), amount = val('f-amount');

  const showErr = (m) => { const e = document.getElementById('identity-error'); e.style.display='block'; e.textContent = m; };
  if(!firstname || !lastname || !society || !email || !phone || !amount) return showErr('Merci de compléter tous les champs.');
  if(password.length < 8) return showErr('Le mot de passe doit faire au moins 8 caractères.');
  if(password !== password2) return showErr('Les deux mots de passe ne correspondent pas.');
  if(!SB_READY) return showErr('Configuration Supabase manquante (voir assets/supabase-config.js).');

  const btn = document.getElementById('identity-submit');
  btn.disabled = true; btn.style.opacity = '.6';

  const fullName = firstname + ' ' + lastname;
  const { data: signData, error: signErr } = await sb.auth.signUp({
    email, password,
    options: { data: { first_name: firstname, last_name: lastname, full_name: fullName, role: 'client' } }
  });
  if(signErr){ btn.disabled=false; btn.style.opacity='1';
    return showErr(signErr.message.includes('already registered')
      ? 'Cet email a déjà un compte. Connectez-vous depuis « Connexion ».' : signErr.message);
  }

  // S'assurer d'avoir une session (si confirmation email désactivée)
  let session = signData.session;
  if(!session){
    const { data: inData } = await sb.auth.signInWithPassword({ email, password });
    session = inData?.session || null;
  }
  if(!session){
    btn.disabled=false; btn.style.opacity='1';
    return showErr('Compte créé. Confirmez votre email puis connectez-vous via « Connexion ».');
  }

  const deal = await createDeal({
    client_id: session.user.id,
    society, contact: fullName, first_name: firstname, last_name: lastname,
    email, phone,
    besoin: answers.besoin || 'Financement',
    objet: answers.objet || '—',
    scenario: answers.scenario || 'invest_autre',
    solution: answers.solution || null,
    amount, amount_num: amountToNumber(amount),
    status: 'pieces'
  });
  if(!deal){ btn.disabled=false; btn.style.opacity='1'; return showErr('Erreur à la création du dossier. Réessayez.'); }

  await bootstrapSession();
}

/* ---------------------------------------------------------------------
   5. Data layer (Supabase)
   ------------------------------------------------------------------- */
async function createDeal(d){
  const { data: deal, error } = await sb.from('deals').insert(d).select().single();
  if(error){ console.error('createDeal', error); return null; }

  const docs = getRequiredDocs(d.scenario).map(x => ({ ...x, deal_id: deal.id, uploaded: false }));
  await sb.from('documents').insert(docs);

  const fn = d.first_name || '';
  await sb.from('messages').insert([
    { deal_id: deal.id, sender: 'consultant', author: 'Sophie Lefèvre',
      body: `Bonjour ${fn}, je suis Sophie Lefèvre, votre consultante dédiée. J'ai pris connaissance de votre dossier — pourriez-vous me transmettre votre dernier bilan dès que possible ?` },
    { deal_id: deal.id, sender: 'consultant', author: 'Sophie Lefèvre',
      body: 'Je suis disponible pour un point téléphonique demain entre 14h et 17h si vous le souhaitez.' }
  ]);
  return deal;
}

async function fetchDealBundle(dealId){
  const [{ data: deal }, { data: docs }, { data: msgs }] = await Promise.all([
    sb.from('deals').select('*').eq('id', dealId).single(),
    sb.from('documents').select('*').eq('deal_id', dealId).order('created_at'),
    sb.from('messages').select('*').eq('deal_id', dealId).order('created_at')
  ]);
  if(!deal) return null;
  deal.docs = docs || []; deal.messages = msgs || [];
  return deal;
}

async function fetchMyDeal(){
  const { data } = await sb.from('deals').select('*')
    .eq('client_id', app.session.user.id).order('created_at', { ascending: false }).limit(1);
  if(!data || !data.length) return null;
  return await fetchDealBundle(data[0].id);
}

async function fetchAllDeals(){
  const { data: deals } = await sb.from('deals').select('*').order('created_at', { ascending: false });
  if(!deals) return [];
  const { data: docs } = await sb.from('documents').select('deal_id, uploaded');
  const counts = {};
  (docs || []).forEach(x => {
    counts[x.deal_id] = counts[x.deal_id] || { total: 0, done: 0 };
    counts[x.deal_id].total++; if(x.uploaded) counts[x.deal_id].done++;
  });
  deals.forEach(d => { d._docs = counts[d.id] || { total: 0, done: 0 }; });
  return deals;
}

async function uploadDocument(dealId, doc, file){
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${dealId}/${doc.doc_key}-${Date.now()}-${safe}`;
  const { error: upErr } = await sb.storage.from('documents').upload(path, file, { upsert: true });
  if(upErr){ console.error('upload', upErr); alert('Échec du téléversement : ' + upErr.message); return false; }
  const { error } = await sb.from('documents').update({
    uploaded: true, file_path: path, file_name: file.name, file_size: formatSize(file.size)
  }).eq('id', doc.id);
  if(error){ console.error(error); return false; }
  await maybeAdvanceStatus(dealId);
  return true;
}

async function maybeAdvanceStatus(dealId){
  const { data: docs } = await sb.from('documents').select('uploaded').eq('deal_id', dealId);
  const { data: deal } = await sb.from('deals').select('status').eq('id', dealId).single();
  if(deal && deal.status === 'pieces' && docs && docs.length && docs.every(d => d.uploaded)){
    await sb.from('deals').update({ status: 'complete' }).eq('id', dealId);
  }
}

async function openDocFile(filePath){
  if(!filePath) return;
  const { data, error } = await sb.storage.from('documents').createSignedUrl(filePath, 120);
  if(error){ alert('Impossible d\'ouvrir le fichier.'); return; }
  window.open(data.signedUrl, '_blank');
}

async function sendMessageDB(dealId, sender, author, body){
  await sb.from('messages').insert({ deal_id: dealId, sender, author, body });
}
async function updateDealStatus(dealId, status){
  await sb.from('deals').update({ status }).eq('id', dealId);
}
async function updateDealNotes(dealId, notes){
  await sb.from('deals').update({ notes }).eq('id', dealId);
}

/* ---------------------------------------------------------------------
   6. Authentification + routing
   ------------------------------------------------------------------- */
function openLogin(){ document.getElementById('login-modal').classList.add('active'); }
function closeLogin(){ document.getElementById('login-modal').classList.remove('active'); }

async function doLogin(){
  const email = val('login-email'), password = val('login-password');
  const err = document.getElementById('login-error');
  err.style.display = 'none';
  if(!SB_READY){ err.style.display='block'; err.textContent='Configuration Supabase manquante.'; return; }
  if(!email || !password){ err.style.display='block'; err.textContent='Email et mot de passe requis.'; return; }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if(error){ err.style.display='block'; err.textContent = 'Identifiants incorrects.'; return; }
  closeLogin();
  await bootstrapSession();
}

async function doLogout(){
  await sb.auth.signOut();
  app.session = app.profile = app.role = app.currentDeal = null;
  app.deals = [];
  teardownRealtime();
  restart();
  showView('landing');
}

async function bootstrapSession(){
  const { data: { session } } = await sb.auth.getSession();
  app.session = session;
  if(!session){ showView('landing'); return; }

  const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  app.profile = profile || { role: 'client', full_name: session.user.email };
  app.role = app.profile.role;

  teardownRealtime();
  if(app.role === 'consultant'){
    setText('bo-consultant-name', app.profile.full_name || 'Consultant');
    await loadBO();
    showView('bo');
    setupRealtimeBO();
  } else {
    app.currentDeal = await fetchMyDeal();
    if(app.currentDeal){
      renderClient();
      showView('client');
      setupRealtimeClient(app.currentDeal.id);
    } else {
      showView('landing'); // client sans dossier : retour qualification
    }
  }
}

/* ---------------------------------------------------------------------
   7. Realtime
   ------------------------------------------------------------------- */
function teardownRealtime(){
  app.channels.forEach(c => sb && sb.removeChannel(c));
  app.channels = [];
}
function setupRealtimeClient(dealId){
  const ch = sb.channel('client-' + dealId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `deal_id=eq.${dealId}` }, refreshClient)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deals', filter: `id=eq.${dealId}` }, refreshClient)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `deal_id=eq.${dealId}` }, refreshClient)
    .subscribe();
  app.channels.push(ch);
}
function setupRealtimeBO(){
  const ch = sb.channel('bo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, loadBO)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
      const open = document.getElementById('modal').classList.contains('active');
      if(open && app._openDealId) openDeal(app._openDealId);
    })
    .subscribe();
  app.channels.push(ch);
}
async function refreshClient(){
  if(!app.currentDeal) return;
  app.currentDeal = await fetchDealBundle(app.currentDeal.id);
  if(app.currentDeal) renderClient();
}
async function loadBO(){
  app.deals = await fetchAllDeals();
  renderBO();
}

/* ---------------------------------------------------------------------
   8. Rendu — Espace client
   ------------------------------------------------------------------- */
function renderClient(){
  const deal = app.currentDeal;
  if(!deal) return;
  setText('client-firstname', deal.first_name);
  setText('msg-firstname', deal.first_name);
  setText('client-name', deal.society);
  setText('client-contact', deal.contact + ' · Dirigeant');
  document.getElementById('stat-amount').innerHTML = `<em>${deal.amount || '—'}</em>`;
  setText('stat-type', deal.besoin + (deal.objet && deal.objet !== '—' ? ' · ' + deal.objet : ''));

  const statusObj = STATUSES.find(s => s.id === deal.status) || STATUSES[1];
  setText('stat-status', statusObj.label);

  const docsDone = deal.docs.filter(d => d.uploaded).length;
  setText('stat-docs-done', docsDone);
  setText('stat-docs-total', deal.docs.length);
  setText('stat-docs-pct', (deal.docs.length ? Math.round((docsDone/deal.docs.length)*100) : 0) + '% complété');

  const currentStep = statusObj.step;
  document.getElementById('client-timeline').innerHTML = TIMELINE_STEPS.map(s => {
    const stepNum = STATUSES.find(st => st.id === s.id).step;
    const isDone = stepNum < currentStep, isCurrent = stepNum === currentStep;
    const cls = isDone ? 'done' : (isCurrent ? 'current' : '');
    const dateText = isDone ? formatShortDate(addDays(deal.created_at, stepNum-1)) : (isCurrent ? 'En cours' : '');
    const icon = isDone
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
      : (isCurrent
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>'
        : `<span style="font-size:13px;font-weight:600">${stepNum}</span>`);
    return `<div class="t-step ${cls}"><div class="t-dot">${icon}</div><div class="t-content"><h4>${s.title}</h4><p>${s.desc}</p></div><div class="t-date">${dateText}</div></div>`;
  }).join('');

  document.getElementById('client-docs').innerHTML = deal.docs.map(doc => `
    <div class="doc-card ${doc.uploaded ? 'uploaded' : ''}">
      <div class="doc-head">
        <div class="doc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2 H6 A2 2 0 0 0 4 4 V20 A2 2 0 0 0 6 22 H18 A2 2 0 0 0 20 20 V8 Z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <span class="doc-status ${doc.uploaded ? 'uploaded' : 'pending'}">${doc.uploaded ? '✓ Reçu' : '○ En attente'}</span>
      </div>
      <div><div class="doc-name">${doc.name}</div><div class="doc-desc">${doc.description || ''}</div></div>
      ${doc.uploaded
        ? `<div class="doc-uploaded-info"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> <b style="cursor:pointer;text-decoration:underline" onclick="openDocFile('${doc.file_path}')">${doc.file_name}</b> · ${doc.file_size || ''}</div>`
        : `<label class="doc-upload"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg> Téléverser<input type="file" style="display:none" onchange="handleUpload('${doc.id}', this.files[0])" /></label>`}
    </div>`).join('');

  renderThread(deal);
}

function renderThread(deal){
  const t = document.getElementById('client-thread');
  if(!t) return;
  t.innerHTML = deal.messages.map(m => {
    const mine = m.sender === 'client';
    const av = mine ? `${(deal.first_name||'').charAt(0)}${(deal.last_name||'').charAt(0)}` : 'SL';
    return `<div class="msg ${mine ? 'me' : 'them'}"><div class="msg-avatar">${av}</div><div><div class="msg-bubble">${escapeHtml(m.body)}</div><div class="msg-meta">${mine ? 'Vous' : (m.author || 'Consultant')} · ${formatDateTime(m.created_at)}</div></div></div>`;
  }).join('');
  t.scrollTop = t.scrollHeight;
}

async function handleUpload(docId, file){
  if(!file || !app.currentDeal) return;
  const doc = app.currentDeal.docs.find(d => d.id === docId);
  if(!doc) return;
  const ok = await uploadDocument(app.currentDeal.id, doc, file);
  if(ok) await refreshClient();
}

async function sendMsg(){
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if(!text || !app.currentDeal) return;
  input.value = '';
  await sendMessageDB(app.currentDeal.id, 'client', app.currentDeal.contact, text);
  await refreshClient();
}

/* ---------------------------------------------------------------------
   9. Rendu — Back-office consultant
   ------------------------------------------------------------------- */
function renderBO(){
  const deals = app.deals;
  setText('bo-count', deals.filter(d => d.status !== 'lost').length);
  setText('bo-stat-1', deals.filter(d => ['instruct','present','offer'].includes(d.status)).length);
  setText('bo-stat-2', formatEuro(deals.filter(d => !['won','lost'].includes(d.status)).reduce((s,d)=>s+(d.amount_num||0),0)));
  setText('bo-stat-3', deals.filter(d => d.status === 'won').length);

  const cols = STATUSES.filter(s => s.id !== 'lost');
  document.getElementById('kanban').innerHTML = cols.map(col => {
    const colDeals = deals.filter(d => d.status === col.id);
    return `<div class="k-col">
        <div class="k-col-head"><div class="k-col-title"><span class="k-dot ${col.cls}-bg"></span>${col.label}</div><div class="k-col-count">${colDeals.length}</div></div>
        ${colDeals.map(d => `
          <div class="k-card" onclick="openDeal('${d.id}')">
            <div><div class="society">${d.society || '—'}</div><div class="contact">${d.contact || ''}</div></div>
            <div class="amount">${d.amount || '—'}</div>
            <div class="k-meta"><span class="tag">${d.besoin || ''}</span>
              <span class="docs-progress"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2 H6 A2 2 0 0 0 4 4 V20 A2 2 0 0 0 6 22 H18 A2 2 0 0 0 20 20 V8 Z"/><polyline points="14 2 14 8 20 8"/></svg>${d._docs ? d._docs.done : 0}/${d._docs ? d._docs.total : 0}</span>
            </div>
          </div>`).join('') || '<div style="color:var(--muted-2);font-size:12px;text-align:center;padding:30px 0">—</div>'}
      </div>`;
  }).join('');
}

async function openDeal(dealId){
  app._openDealId = dealId;
  const deal = await fetchDealBundle(dealId);
  if(!deal) return;
  const docsDone = deal.docs.filter(d => d.uploaded).length;
  const statusLabel = (STATUSES.find(s=>s.id===deal.status)||{}).label || deal.status;

  document.getElementById('modal-content').innerHTML = `
    <div class="modal-head">
      <div><h3>${deal.society || '—'}</h3><div class="sub">${deal.contact || ''} · ${deal.email || ''} · ${deal.phone || ''}</div></div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-section">
        <div class="modal-section-title">Synthèse du dossier</div>
        <div class="modal-grid">
          <div class="modal-field"><span>Type de besoin</span><span>${deal.besoin || '—'}</span></div>
          <div class="modal-field"><span>Objet</span><span>${deal.objet || '—'}</span></div>
          <div class="modal-field"><span>Montant</span><span style="color:var(--gold-2);font-weight:600">${deal.amount || '—'}</span></div>
          <div class="modal-field"><span>Statut actuel</span><span>${statusLabel}</span></div>
          <div class="modal-field"><span>Consultant</span><span>${deal.consultant || '—'}</span></div>
          <div class="modal-field"><span>Reçu le</span><span>${formatShortDate(deal.created_at)}</span></div>
        </div>
      </div>
      <div class="modal-section">
        <div class="modal-section-title">Pièces (${docsDone}/${deal.docs.length})</div>
        <div class="doc-list-modal">
          ${deal.docs.map(d => `
            <div class="doc-item-modal ${d.uploaded ? 'ok' : 'missing'}">
              ${d.uploaded
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'}
              <span class="name">${d.name}</span>
              <span class="meta">${d.uploaded ? `<span style="cursor:pointer;text-decoration:underline" onclick="openDocFile('${d.file_path}')">${d.file_name}</span> · ${d.file_size || ''}` : 'En attente'}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="modal-section">
        <div class="modal-section-title">Messagerie</div>
        <div class="msg-thread" style="max-height:220px;margin-bottom:12px" id="bo-thread">
          ${deal.messages.map(m => {
            const fromCons = m.sender === 'consultant';
            return `<div class="msg ${fromCons ? 'me' : 'them'}"><div class="msg-avatar">${fromCons ? 'SL' : ((deal.first_name||'').charAt(0)+(deal.last_name||'').charAt(0))}</div><div><div class="msg-bubble">${escapeHtml(m.body)}</div><div class="msg-meta">${fromCons ? (m.author||'Vous') : (deal.contact||'Client')} · ${formatDateTime(m.created_at)}</div></div></div>`;
          }).join('')}
        </div>
        <div class="msg-input-row"><input type="text" id="bo-msg-input" placeholder="Répondre au client…" onkeydown="if(event.key==='Enter') boReply('${deal.id}')" /><button class="btn btn-primary btn-sm" onclick="boReply('${deal.id}')">Envoyer</button></div>
      </div>
      <div class="modal-section">
        <div class="modal-section-title">Notes internes</div>
        <textarea id="bo-notes" style="width:100%;background:rgba(11,18,32,.5);border:1px solid var(--line);color:#fff;border-radius:10px;padding:12px;font-family:inherit;font-size:13.5px;min-height:80px;resize:vertical" placeholder="Notes confidentielles (non visibles côté client)…">${deal.notes || ''}</textarea>
      </div>
    </div>
    <div class="modal-foot">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:12px;color:var(--muted)">Faire avancer :</span>
        <select class="status-select" onchange="changeStatus('${deal.id}', this.value)">
          ${STATUSES.map(s => `<option value="${s.id}" ${s.id===deal.status?'selected':''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="closeModal()">Fermer</button>
        <button class="btn btn-primary btn-sm" onclick="saveDeal('${deal.id}')">Enregistrer</button>
      </div>
    </div>`;
  document.getElementById('modal').classList.add('active');
}

function closeModal(){ document.getElementById('modal').classList.remove('active'); app._openDealId = null; }

async function changeStatus(dealId, newStatus){
  await updateDealStatus(dealId, newStatus);
  await loadBO();
  openDeal(dealId);
}
async function saveDeal(dealId){
  const notes = val('bo-notes');
  await updateDealNotes(dealId, notes);
  closeModal();
}
async function boReply(dealId){
  const input = document.getElementById('bo-msg-input');
  const text = input.value.trim();
  if(!text) return;
  input.value = '';
  await sendMessageDB(dealId, 'consultant', app.profile.full_name || 'Consultant', text);
  openDeal(dealId);
}

/* ---------------------------------------------------------------------
   10. Helpers + view switcher
   ------------------------------------------------------------------- */
function val(id){ const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function setText(id, txt){ const el = document.getElementById(id); if(el) el.textContent = txt; }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function formatSize(bytes){ if(bytes<1024) return bytes+' B'; if(bytes<1048576) return Math.round(bytes/1024)+' KB'; return (bytes/1048576).toFixed(1)+' MB'; }
function formatEuro(n){ if(n>=1000000) return (n/1000000).toFixed(1).replace('.0','')+' M€'; if(n>=1000) return Math.round(n/1000)+' K€'; return n+' €'; }
function formatShortDate(iso){ if(!iso) return ''; return new Date(iso).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }); }
function formatDateTime(iso){ if(!iso) return ''; const d=new Date(iso); const today=new Date().toDateString()===d.toDateString();
  return (today ? 'Aujourd\'hui' : d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})) + ' à ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); }
function addDays(iso, n){ const d=new Date(iso); d.setDate(d.getDate()+n); return d.toISOString(); }

function showView(view){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if(el) el.classList.add('active');
}

/* ---------------------------------------------------------------------
   11. Init
   ------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  renderNode('start');
  if(!SB_READY){ showView('landing'); return; }
  await bootstrapSession();
  sb.auth.onAuthStateChange((event) => {
    if(event === 'SIGNED_OUT'){ showView('landing'); }
  });
});
