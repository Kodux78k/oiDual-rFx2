/* app.js — extracted & refactored from monolith
   Note: This file assumes styles.css and index.html are in same folder.
   All localStorage keys are prefixed with DI_.
*/

(function(){
  // DOM refs
  const els = {
    card: document.getElementById('mainCard'),
    header: document.getElementById('cardHeader'),
    avatarTgt: document.getElementById('avatarTarget'),
    input: document.getElementById('inputUser'),
    lblHello: document.getElementById('lblHello'),
    lblName: document.getElementById('lblName'),
    clock: document.getElementById('clockTime'),
    smallPreview: document.getElementById('smallPreview'),
    smallMiniAvatar: document.getElementById('smallMiniAvatar'),
    smallText: document.getElementById('smallText'),
    smallIdent: document.getElementById('smallIdent'),
    actCard: document.getElementById('activationCard'),
    actPre: document.getElementById('actPre'),
    actName: document.getElementById('actName'),
    actMiniAvatar: document.getElementById('actMiniAvatar'),
    actBadge: document.getElementById('actBadge'),
    securityStatus: document.getElementById('securityStatus'),
    keysModal: document.getElementById('keysModal'),
    keyList: document.getElementById('keyList'),
    keyName: document.getElementById('keyNameInput'),
    keyToken: document.getElementById('keyTokenInput'),
    keyWebhook: document.getElementById('keyWebhookInput'),
    addKeyBtn: document.getElementById('addKeyBtn'),
    closeKeysBtn: document.getElementById('closeKeysBtn'),
    testWebhookBtn: document.getElementById('testWebhookBtn'),
    exportKeysBtn: document.getElementById('exportKeysBtn'),
    importKeysBtn: document.getElementById('importKeysBtn'),
    importFileInput: document.getElementById('importFileInput'),
    lockVaultBtn: document.getElementById('lockVaultBtn'),
    vaultStatusText: document.getElementById('vaultStatusText'),
    vaultModal: document.getElementById('vaultModal'),
    vaultPass: document.getElementById('vaultPassInput'),
    vaultUnlock: document.getElementById('vaultUnlockBtn'),
    vaultCancel: document.getElementById('vaultCancelBtn'),
    togglePanel: document.getElementById('togglePanel'),
    userNameInput: document.getElementById('userNameInput'),
    infodoseNameInput: document.getElementById('infodoseNameInput'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    modelInput: document.getElementById('modelInput'),
    trainingUpload: document.getElementById('trainingUpload'),
    importTrainingBtn: document.getElementById('importTrainingBtn'),
    exportTrainingBtn: document.getElementById('exportTrainingBtn'),
    trainingFileName: document.getElementById('trainingFileName'),
    assistantActiveCheckbox: document.getElementById('assistantActiveCheckbox'),
    trainingActiveCheckbox: document.getElementById('trainingActiveCheckbox'),
    savePanelBtn: document.getElementById('savePanelBtn'),
    closePanelBtn: document.getElementById('closePanelBtn'),
    modeElectron: document.getElementById('modeElectron'),
    modeNeutron: document.getElementById('modeNeutron')
  };

  // crypto utils (same as before)
  const CRYPTO = {
    algo: { name: 'AES-GCM', length: 256 },
    pbkdf2: { name: 'PBKDF2', hash: 'SHA-256', iterations: 100000 },
    salt: window.crypto.getRandomValues(new Uint8Array(16)),
    async getKey(password, salt) {
      const enc = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
      return window.crypto.subtle.deriveKey({ ...this.pbkdf2, salt: salt }, keyMaterial, this.algo, false, ["encrypt", "decrypt"]);
    },
    async encrypt(data, password) {
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const key = await this.getKey(password, salt);
      const encoded = new TextEncoder().encode(JSON.stringify(data));
      const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encoded);
      const bundle = { s: Array.from(salt), iv: Array.from(iv), d: Array.from(new Uint8Array(encrypted)) };
      return JSON.stringify(bundle);
    },
    async decrypt(bundleStr, password) {
      try {
        const bundle = JSON.parse(bundleStr);
        const salt = new Uint8Array(bundle.s);
        const iv = new Uint8Array(bundle.iv);
        const data = new Uint8Array(bundle.d);
        const key = await this.getKey(password, salt);
        const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
        return JSON.parse(new TextDecoder().decode(decrypted));
      } catch(e) { throw new Error("Senha incorreta ou dados corrompidos"); }
    }
  };

  // state
  const STORAGE_KEY = 'DI_FUSION_OS_DATA_V2';
  const CRYSTAL_KEY = 'DI_CRISTALIZADOS';
  let STATE = { keys: [], user: 'Convidado', isEncrypted: false, encryptedData: null };
  let SESSION_PASSWORD = null;

  function saveData() {
    const payload = { keys: STATE.keys, user: STATE.user };
    if (SESSION_PASSWORD) {
      CRYPTO.encrypt(payload, SESSION_PASSWORD).then(enc => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ isEncrypted: true, data: enc }));
        STATE.isEncrypted = true;
        STATE.encryptedData = enc;
        updateSecurityUI();
      });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ isEncrypted: false, data: payload }));
    }
  }

  async function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.isEncrypted) {
      STATE.isEncrypted = true;
      STATE.encryptedData = parsed.data;
      updateSecurityUI();
    } else {
      STATE.keys = parsed.data.keys || [];
      STATE.user = parsed.data.user || 'Convidado';
      const active = STATE.keys.find(k=>k.active);
      if(active && active.token) {
        localStorage.setItem('DI_APIKEY', active.token);
        apiKey = active.token;
      }
      if(STATE.user !== 'Convidado') {
        localStorage.setItem('DI_USERNAME', STATE.user);
        userName = STATE.user;
        if (els.userNameInput) els.userNameInput.value = STATE.user;
      }
      updateInterface(STATE.user);
      renderKeysList();
    }
  }

  // utilities
  const hashStr = s => { let h=0xdeadbeef; for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),2654435761);} return (h^h>>>16)>>>0; };
  function escapeHtml(s){ return s ? s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) : ''; }

  const createSvg = (id,sz) => `<svg viewBox="0 0 100 100" width="${sz}" height="${sz}"><defs><linearGradient id="g${id}"><stop offset="0%" stop-color="#00f2ff"/><stop offset="100%" stop-color="#bd00ff"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="#080b12" stroke="rgba(255,255,255,0.1)"/><circle cx="50" cy="50" r="20" fill="url(#g${id})" opacity="0.9"/></svg>`;
  const createMiniSvg = (name,sz=30) => {
    const s = hashStr(name||'D'); const h1=s%360; const h2=(s*37)%360;
    const grad = `<linearGradient id="gm${s}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1},90%,50%)"/><stop offset="1" stop-color="hsl(${h2},90%,50%)"/></linearGradient>`;
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 32 32"><defs>${grad}</defs><rect width="32" height="32" rx="8" fill="#0a1016"/><circle cx="16" cy="16" r="6" fill="url(#gm${s})"/></svg>`;
  };

  function updateInterface(name){
    const safe = name || 'Convidado';
    if (els.lblName) els.lblName.innerText = safe;
    if (els.input) els.input.value = safe;
    const activeKey = STATE.keys.find(k=>k.active);
    if (els.smallIdent) els.smallIdent.innerText = activeKey ? activeKey.name : '--';
    if (els.actBadge) els.actBadge.innerText = activeKey ? `key:${activeKey.name}` : 'v:--';
    if (els.smallMiniAvatar) els.smallMiniAvatar.innerHTML = createMiniSvg(safe);
    if (els.actMiniAvatar) els.actMiniAvatar.innerHTML = createMiniSvg(safe,36);
    if (els.actName) els.actName.innerText = safe;
    if (els.avatarTgt) els.avatarTgt.innerHTML = createSvg('Main',64);
    const phrases = ["Foco estável.","Ritmo criativo.","Percepção sutil."];
    if (els.smallText) els.smallText.innerText = activeKey ? `${activeKey.name} [ATIVO]` : (safe==='Convidado'?'Aguardando...':`${safe} · ${phrases[safe.length%phrases.length]}`);
    if (els.actPre) {
      const line = `+${'-'.repeat(safe.length+4)}+`;
      els.actPre.innerText = `${line}\n| ${safe.toUpperCase()} |\n${line}\nID: ${hashStr(safe).toString(16)}`;
    }
    const tiUser = document.getElementById('displayUser');
    if(tiUser) tiUser.innerText = 'User: ' + safe;
  }

  function updateSecurityUI() {
    if (SESSION_PASSWORD) {
      if (els.securityStatus) els.securityStatus.innerText = "COFRE DESTRANCADO";
      if (els.vaultStatusText) els.vaultStatusText.innerText = "Cofre Protegido (Destrancado)";
      if (els.lockVaultBtn) els.lockVaultBtn.innerText = "TRANCAR";
    } else if (STATE.isEncrypted) {
      if (els.securityStatus) els.securityStatus.innerText = "CRIPTOGRAFADO";
      if (els.vaultStatusText) els.vaultStatusText.innerText = "Cofre Trancado";
      if (els.lockVaultBtn) els.lockVaultBtn.innerText = "REDEFINIR";
    } else {
      if (els.securityStatus) els.securityStatus.innerText = "SEM PROTEÇÃO";
      if (els.vaultStatusText) els.vaultStatusText.innerText = "Cofre Aberto (Sem senha)";
      if (els.lockVaultBtn) els.lockVaultBtn.innerText = "CRIAR SENHA";
    }
  }

  function renderKeysList(){
    if (!els.keyList) return;
    els.keyList.innerHTML = '';
    if(STATE.keys.length===0){ els.keyList.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:20px">Nenhuma chave armazenada.</div>'; return; }
    STATE.keys.forEach(k=>{
      const div = document.createElement('div');
      div.className = `key-item ${k.active?'active-item':''}`;
      const typeInfo = k.webhook ? '<span style="color:var(--neon-purple)">WEBHOOK</span>' : 'API KEY';
      div.innerHTML = `
        <div class="meta"><div style="font-weight:700;font-size:0.9rem">${escapeHtml(k.name)}</div><div style="font-size:0.75rem;color:rgba(255,255,255,0.5)">${typeInfo}</div></div>
        <div class="actions">
          ${!k.active ? `<button class="small-btn" data-id="${k.id}" data-action="activate">ATIVAR</button>` : `<span style="font-size:0.7rem;font-weight:700;color:var(--neon-cyan);margin-right:10px">ATIVA</span>`}
          <button class="small-btn danger" data-id="${k.id}" data-action="remove">DEL</button>
        </div>`;
      els.keyList.appendChild(div);
    });
    // delegate click handlers
    els.keyList.querySelectorAll('[data-action="activate"]').forEach(btn=>{
      btn.addEventListener('click', ()=> setActiveKey(btn.dataset.id));
    });
    els.keyList.querySelectorAll('[data-action="remove"]').forEach(btn=>{
      btn.addEventListener('click', ()=> removeKey(btn.dataset.id));
    });
  }

  function addKey() {
    const name = els.keyName.value.trim();
    const token = els.keyToken.value.trim();
    const webhook = els.keyWebhook.value.trim();
    if(!name){ showToaster('Nome obrigatório','error'); return; }
    const newKey = { id: Date.now().toString(36), name, token, webhook, active: STATE.keys.length===0 };
    STATE.keys.push(newKey);
    if(newKey.active && newKey.token) {
      localStorage.setItem('DI_APIKEY', newKey.token);
      apiKey = newKey.token;
    }
    saveData(); renderKeysList(); updateInterface(STATE.user);
    els.keyName.value=''; els.keyToken.value=''; els.keyWebhook.value='';
    showToaster('Chave adicionada!', 'success');
  }

  function removeKey(id) {
    if(confirm('Remover chave permanentemente?')){
      STATE.keys = STATE.keys.filter(k=>k.id!==id);
      saveData(); renderKeysList(); updateInterface(STATE.user);
      showToaster('Chave removida', 'success');
    }
  }

  function setActiveKey(id) {
    let activatedToken = null;
    STATE.keys.forEach(k=> {
      k.active = (k.id===id);
      if(k.active) activatedToken = k.token;
    });
    if(activatedToken) {
      localStorage.setItem('DI_APIKEY', activatedToken);
      apiKey = activatedToken;
      if(els.apiKeyInput) els.apiKeyInput.value = activatedToken;
      showToaster('Chave sincronizada com o Chat.', 'success');
    }
    saveData(); renderKeysList(); updateInterface(STATE.user);
  }

  // Vault Events
  if (els.testWebhookBtn) els.testWebhookBtn.addEventListener('click', ()=> showToaster('Ping enviado (simulado)','success'));
  function openManager() {
    if (STATE.isEncrypted && !SESSION_PASSWORD) { if (els.vaultModal) els.vaultModal.style.display='flex'; if (els.vaultPass) els.vaultPass.focus(); } 
    else { if (els.keysModal) els.keysModal.style.display='flex'; }
  }
  if (els.vaultUnlock) els.vaultUnlock.addEventListener('click', async () => {
    const pass = els.vaultPass.value;
    try {
      const decrypted = await CRYPTO.decrypt(STATE.encryptedData, pass);
      SESSION_PASSWORD = pass; STATE.keys = decrypted.keys; STATE.user = decrypted.user;
      const active = STATE.keys.find(k=>k.active);
      if(active && active.token) { localStorage.setItem('DI_APIKEY', active.token); apiKey = active.token; }
      if(STATE.user) { localStorage.setItem('DI_USERNAME', STATE.user); userName = STATE.user; }
      if (els.vaultModal) els.vaultModal.style.display='none'; if (els.keysModal) els.keysModal.style.display='flex'; if (els.vaultPass) els.vaultPass.value='';
      renderKeysList(); updateSecurityUI(); showToaster('Cofre destrancado.', 'success');
    } catch(e) { showToaster('Senha incorreta.', 'error'); }
  });
  if (els.lockVaultBtn) els.lockVaultBtn.addEventListener('click', () => {
     if (!SESSION_PASSWORD && !STATE.isEncrypted) {
       const newPass = prompt("Defina uma senha para o Cofre:");
       if(newPass) { SESSION_PASSWORD=newPass; saveData(); showToaster("Cofre trancado.", 'success'); }
     } else if (SESSION_PASSWORD) {
       SESSION_PASSWORD=null; if (els.keysModal) els.keysModal.style.display='none'; showToaster("Sessão do cofre encerrada.", 'success');
     } else {
       showToaster("Cofre já criptografado. Desbloqueie para redefinir.", 'error');
     }
     updateSecurityUI();
  });
  if (els.vaultCancel) els.vaultCancel.addEventListener('click', ()=> { if (els.vaultModal) els.vaultModal.style.display='none'; });
  if (els.closeKeysBtn) els.closeKeysBtn.addEventListener('click', ()=> { if (els.keysModal) els.keysModal.style.display='none'; });
  if (els.addKeyBtn) els.addKeyBtn.addEventListener('click', addKey);

  // Orb gestures
  let gestureState = { isOrb:false, isHud:false, isDragging:false, startX:0, startY:0, timer:null };
  if (els.card) els.card.addEventListener('pointerdown', handleStart);
  document.addEventListener('pointermove', handleMove);
  document.addEventListener('pointerup', handleEnd);
  if (els.avatarTgt) els.avatarTgt.addEventListener('click', ()=>{ if(!gestureState.isOrb && !gestureState.isHud) openManager(); });

  function handleStart(e) {
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.keys-card')) return;
    if(!gestureState.isOrb && !gestureState.isHud && !els.header.contains(e.target)) return;
    gestureState.startX=e.clientX; gestureState.startY=e.clientY; gestureState.isDragging=false;
    gestureState.timer = setTimeout(() => {
      if(gestureState.isOrb) openManager();
      else if (!gestureState.isHud) transmuteToOrb(e.clientX, e.clientY);
    }, 600);
    if(gestureState.isOrb) { els.card.setPointerCapture(e.pointerId); const r=els.card.getBoundingClientRect(); gestureState.offsetX=e.clientX-r.left; gestureState.offsetY=e.clientY-r.top; }
  }
  function handleMove(e) {
    if(!gestureState.timer && !gestureState.isOrb) return;
    if(Math.hypot(e.clientX-gestureState.startX, e.clientY-gestureState.startY)>10) {
      if(gestureState.timer){ clearTimeout(gestureState.timer); gestureState.timer=null; }
      if(gestureState.isOrb){ gestureState.isDragging=true; els.card.style.left=(e.clientX-gestureState.offsetX)+'px'; els.card.style.top=(e.clientY-gestureState.offsetY)+'px'; els.card.style.transform='none'; }
    }
  }
  function handleEnd(e) {
    if(gestureState.timer){ clearTimeout(gestureState.timer); gestureState.timer=null; }
    if(gestureState.isDragging && gestureState.isOrb){ gestureState.isDragging=false; snapOrb(e.clientX, e.clientY); return; }
    if(Math.hypot(e.clientX-gestureState.startX, e.clientY-gestureState.startY)<10) {
      if(gestureState.isOrb || gestureState.isHud) revertToCard(); else toggleCardState();
    }
  }
  function transmuteToOrb(x,y) {
    if(navigator.vibrate) navigator.vibrate(50);
    els.card.classList.add('orb','closed'); els.card.classList.remove('content-visible');
    els.card.style.left=(x-34)+'px'; els.card.style.top=(y-34)+'px';
    gestureState.isOrb=true; gestureState.isHud=false;
  }
  function snapOrb(x,y) {
    if(y < 80) { gestureState.isHud=true; gestureState.isOrb=false; els.card.classList.add('hud'); els.card.classList.remove('orb'); els.card.style.left=''; els.card.style.top=''; els.card.style.transform=''; } 
    else { const tx=x<window.innerWidth/2?15:window.innerWidth-83; els.card.style.transition='left 0.4s ease, top 0.4s ease'; els.card.style.left=tx+'px'; setTimeout(()=>els.card.style.transition='',400); }
  }
  function revertToCard() {
    gestureState.isOrb=false; gestureState.isHud=false;
    els.card.style.transition='all 0.5s var(--ease-smooth)'; els.card.style.left=''; els.card.style.top=''; els.card.style.width=''; els.card.style.height=''; els.card.style.transform='';
    els.card.classList.remove('orb','hud','closed'); setTimeout(()=>els.card.classList.add('content-visible'),300);
  }
  function toggleCardState() {
    if(els.card.classList.contains('animating')) return;
    const isClosed=els.card.classList.contains('closed'); els.card.classList.add('animating');
    if(isClosed) { els.card.classList.remove('closed'); els.card.animate([{transform:'scale(0.95)',opacity:0.8},{transform:'scale(1)',opacity:1}],{duration:400}).onfinish=()=>{els.card.classList.remove('animating');els.card.classList.add('content-visible');} }
    else { els.card.classList.remove('content-visible'); els.card.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(10px)',opacity:1}],{duration:200}).onfinish=()=>{els.card.classList.add('closed');els.card.classList.remove('animating');} }
  }

  // Toaster
  function showToaster(txt,type='default'){ const t=document.createElement('div'); t.className=`toaster ${type}`; t.innerText=txt; document.getElementById('toasterWrap').appendChild(t); setTimeout(()=>t.classList.add('show'),10); setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300)},2500); }

  function toggleActivation(){ if (els.actCard) { const h=els.actCard.classList.contains('activation-hidden'); els.actCard.classList.toggle('activation-hidden',!h); els.actCard.classList.toggle('activation-open',h); } }

  // CHAT + rendering as in monolith (mdToHtml, splitBlocks, renderPaginatedResponse...)
  const API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
  const TEMPERATURE = 0.2;

  let training = localStorage.getItem('DI_TRAINING_TEXT') || '';
  let trainingFileName = localStorage.getItem('DI_TRAINING_FILENAME') || '';
  let assistantEnabled = (localStorage.getItem('DI_ASSISTANT_ENABLED') === '1');
  let trainingActive = (localStorage.getItem('DI_TRAINING_ACTIVE') !== '0'); 
  let conversation = [];
  let pages = [], currentPage = 0, autoAdvance = true;

  let apiKey = localStorage.getItem('DI_APIKEY') || '';
  let modelName = localStorage.getItem('DI_MODEL_NAME') || 'meta-llama/llama-4-maverick:free';
  let userName = localStorage.getItem('DI_USERNAME') || '';
  let infodoseName = localStorage.getItem('DI_INFODOSE_NAME') || '';

  function updateChatUI() {
     const uEl = document.getElementById('displayUser');
     const iEl = document.getElementById('displayInfodose');
     if(uEl) uEl.innerText = 'User: ' + (userName || '—');
     if(iEl) iEl.innerText = 'Infodose: ' + (infodoseName || '—');
     if(els.apiKeyInput) els.apiKeyInput.value = apiKey;
     if(els.modelInput) els.modelInput.value = modelName;
     if(els.userNameInput) els.userNameInput.value = userName;
  }

  function speakText(txt, onend){
    if (!txt) { if (onend) onend(); return; }
    if (document.body.classList.contains('low-power')) { if (onend) onend(); return; }
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = 'pt-BR'; u.rate = 0.99; u.pitch = 1.1;
    if (window._vozes) u.voice = window._vozes.find(v=>v.lang==='pt-BR') || window._vozes[0];
    if (onend) u.onend = onend;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }

  function mdToHtml(raw) {
    if(!raw) return '';
    let out = escapeHtml(raw);
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
    out = out.replace(/\n/g, '<br>');
    return out;
  }

  const splitBlocks = text => {
    if (!text || !text.trim()) return [['Sem conteúdo.','','']];
    let paras = text.split(/\n\s*\n/).filter(p=>p.trim());
    if (paras.length % 3 !== 0) {
      const sens = paras.join(' ').match(/[^\.!\?]+[\.!\?]+/g) || [paras.join(' ')];
      paras = sens.map(s=>s.trim());
    }
    const groups = [];
    for (let i=0;i<paras.length;i+=3) groups.push(paras.slice(i,i+3));
    return groups;
  };

  function renderPaginatedResponse(text) {
    speechSynthesis.cancel();
    autoAdvance = true;
    const respEl = document.getElementById('response');
    respEl.querySelectorAll('.page:not(.initial)').forEach(p=>p.remove());
    pages = [];
    const groups = splitBlocks(text);
    const controls = respEl.querySelector('.response-controls');
    const titles = ['🎁 Recompensa Inicial','👁️ Exploração e Curiosidade','⚡ Antecipação Vibracional'];

    groups.forEach((tris, gi) => {
      const page = document.createElement('div'); page.className = (gi===0?'page active':'page');
      tris.forEach((body, j) => {
        const cls = j===0?'intro': j===1?'middle':'ending';
        const b = document.createElement('div'); b.className = 'response-block '+cls;
        b.innerHTML = `<h3>${titles[j]}</h3><p>${mdToHtml(body)}</p>`;
        const meta = document.createElement('div'); meta.className='meta';
        const crystalBtn = document.createElement('button'); crystalBtn.className='crystal-btn'; crystalBtn.innerText='✶';
        crystalBtn.title='Cristalizar';
        crystalBtn.addEventListener('click', (ev)=>{
          ev.stopPropagation(); cristalizar({ title: titles[j], content: body });
          crystalBtn.innerText = '✓'; setTimeout(()=> crystalBtn.innerText = '✶', 1200);
        });
        meta.appendChild(crystalBtn); b.appendChild(meta);

        b.dataset.state = '';
        b.addEventListener('click', () => {
          if (!b.dataset.state) {
            const textBody = b.querySelector('p').innerText || body;
            speechSynthesis.cancel(); speakText(textBody); b.classList.add('clicked'); b.dataset.state = 'spoken';
          } else {
            b.classList.add('expanded'); b.dataset.state = '';
            if (!assistantEnabled) {
              assistantEnabled = true; localStorage.setItem('DI_ASSISTANT_ENABLED','1');
              if (training && trainingActive) conversation.unshift({ role:'system', content: training });
            }
            const blockText = `${titles[j]}\n\n${body}`;
            showLoading('Pulso em Expansão...'); speakText('Pulso em Expansão...');
            conversation.push({ role:'user', content: blockText });
            callAI();
          }
        });
        page.appendChild(b);
      });
      const footer = document.createElement('p'); footer.className='footer-text'; footer.innerHTML = `<em>Do seu jeito. <strong>Sempre</strong> único. <strong>Sempre</strong> seu.</em>`;
      page.appendChild(footer);
      respEl.insertBefore(page, controls);
      pages.push(page);
    });

    currentPage = 0; document.getElementById('pageIndicator').textContent = `1 / ${pages.length}`;
    speakPage(0);
  }

  function speakPage(i) {
    const page = pages[i]; if (!page) return;
    const body = Array.from(page.querySelectorAll('.response-block p')).map(p=>p.innerText).join(' ');
    speakText(body, () => {
      if (!autoAdvance) return;
      if (i < pages.length - 1) { changePage(1); speakPage(i+1); } else { speakText('Sempre único, sempre seu.'); }
    });
  }

  function changePage(offset) {
    const np = currentPage + offset; if (np<0||np>=pages.length) return;
    pages[currentPage].classList.remove('active'); pages[np].classList.add('active');
    currentPage = np; document.getElementById('pageIndicator').textContent = `${currentPage+1} / ${pages.length}`;
  }

  function showLoading(msg) {
    const respEl = document.getElementById('response');
    const controls = respEl.querySelector('.response-controls');
    respEl.querySelectorAll('.page:not(.initial)').forEach(p=>p.remove());
    const page = document.createElement('div'); page.className='page active';
    const p = document.createElement('p'); p.className='footer-text'; p.innerText = msg;
    page.appendChild(p);
    respEl.insertBefore(page, controls); pages = [page]; currentPage = 0; document.getElementById('pageIndicator').textContent = '…';
  }

  async function callAI() {
    apiKey = localStorage.getItem('DI_APIKEY') || apiKey;
    if (!apiKey) { alert('Nenhuma API Key ativa! Ative uma chave no Card (Cofre) ou nas Configurações.'); return; }
    const bodyObj = { model: modelName, messages: conversation.slice(), temperature: TEMPERATURE };
    const messagesToSend = [];
    if (assistantEnabled && trainingActive && training) messagesToSend.push({ role:'system', content: training });
    conversation.forEach(m => { if (m.role !== 'system') messagesToSend.push(m); });
    bodyObj.messages = messagesToSend;
    try {
      const resp = await fetch(API_ENDPOINT, {
        method:'POST', headers:{ 'Authorization':`Bearer ${apiKey}`, 'Content-Type':'application/json' },
        body: JSON.stringify(bodyObj)
      });
      if (!resp.ok) throw new Error('Erro API: ' + resp.status);
      const data = await resp.json();
      const answer = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content.trim() : 'Resposta vazia';
      conversation.push({ role:'assistant', content: answer });
      renderPaginatedResponse(answer);
    } catch (err) {
      console.error(err);
      const errorMsg = 'Falha na conexão. Verifique se a chave está ativa no Card.';
      conversation.push({ role:'assistant', content: errorMsg });
      renderPaginatedResponse(errorMsg);
    }
  }

  async function sendMessage(){
    const respEl = document.getElementById('response');
    const initPage = respEl.querySelector('.page.initial');
    if (initPage) initPage.remove();
    const input = document.getElementById('userInput');
    const raw = input.value.trim(); if (!raw) return;
    input.value = '';
    speechSynthesis.cancel(); speakText('');

    const intent = raw.toLowerCase().includes('oi dual') ? 'greeting' : 'message';
    if (intent === 'greeting') {
      assistantEnabled = true; localStorage.setItem('DI_ASSISTANT_ENABLED','1');
      showLoading('Conectando Dual Infodose...');
      if (training && trainingActive) conversation.unshift({ role:'system', content: training });
      speakText('Conectando Dual Infodose...');
    } else {
      showLoading('Processando...');
      speakText('Mensagem enviada.');
    }
    conversation.push({ role:'user', content: raw });
    callAI();
  }

  function cristalizar({ title, content }) {
    const list = JSON.parse(localStorage.getItem(CRYSTAL_KEY) || '[]');
    list.unshift({ id: Date.now(), title, content, user: userName, infodose: infodoseName, at: new Date().toISOString() });
    localStorage.setItem(CRYSTAL_KEY, JSON.stringify(list)); refreshCrystalList();
    speakText('Conteúdo cristalizado.');
  }

  function refreshCrystalList() {
    const list = JSON.parse(localStorage.getItem(CRYSTAL_KEY) || '[]');
    const el = document.getElementById('crystalList'); if (!el) return; el.innerHTML = '';
    if (!list.length) { el.innerHTML = '<div class="small">Vazio.</div>'; return; }
    list.forEach(it => {
      const row = document.createElement('div'); row.className='crystal-item';
      const left = document.createElement('div'); left.innerHTML = `<strong>${escapeHtml(it.title)}</strong><div class="small">${escapeHtml(it.infodose||'')}</div><div style="margin-top:4px;font-size:0.8em">${escapeHtml(it.content.slice(0,100))}...</div>`;
      const actions = document.createElement('div'); actions.className='actions';
      const copyBtn = document.createElement('button'); copyBtn.className='btn btn-sec'; copyBtn.innerText='Copy'; copyBtn.onclick=()=>navigator.clipboard.writeText(it.content);
      const delBtn = document.createElement('button'); delBtn.className='btn btn-sec'; delBtn.innerText='Del'; delBtn.onclick=()=>{ 
          const arr=JSON.parse(localStorage.getItem(CRYSTAL_KEY)||'[]'); 
          localStorage.setItem(CRYSTAL_KEY, JSON.stringify(arr.filter(x=>x.id!==it.id))); refreshCrystalList(); 
      };
      actions.append(copyBtn, delBtn); row.append(left, actions); el.appendChild(row);
    });
  }

  // Init
  document.addEventListener('DOMContentLoaded', ()=> {
    speechSynthesis.onvoiceschanged = () => { window._vozes = speechSynthesis.getVoices(); };

    const sendBtn = document.getElementById('sendBtn'); if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    const userInputEl = document.getElementById('userInput'); if (userInputEl) userInputEl.addEventListener('keypress', e => { if (e.key==='Enter') sendMessage(); });

    document.querySelector('[data-action="prev"]').addEventListener('click', () => changePage(-1));
    document.querySelector('[data-action="next"]').addEventListener('click', () => changePage(1));

    document.getElementById('settingsBtn').addEventListener('click', ()=> {
       updateChatUI();
       if (els.userNameInput) els.userNameInput.value = userName;
       if (els.infodoseNameInput) els.infodoseNameInput.value = infodoseName;
       if (els.togglePanel) els.togglePanel.classList.add('active');
    });
    document.getElementById('toggleBtn').addEventListener('click', ()=> {
       updateChatUI();
       if (els.assistantActiveCheckbox) els.assistantActiveCheckbox.checked = assistantEnabled;
       if (els.trainingActiveCheckbox) els.trainingActiveCheckbox.checked = trainingActive;
       if (els.togglePanel) els.togglePanel.classList.add('active');
    });

    if (els.savePanelBtn) els.savePanelBtn.addEventListener('click', ()=> {
       userName = (els.userNameInput.value || '').trim();
       infodoseName = (els.infodoseNameInput.value || '').trim();
       assistantEnabled = els.assistantActiveCheckbox.checked;
       trainingActive = els.trainingActiveCheckbox.checked;
       apiKey = (els.apiKeyInput.value || '').trim();
       modelName = (els.modelInput.value || '').trim();
       localStorage.setItem('DI_USERNAME', userName); localStorage.setItem('DI_INFODOSE_NAME', infodoseName);
       localStorage.setItem('DI_ASSISTANT_ENABLED', assistantEnabled?'1':'0'); localStorage.setItem('DI_TRAINING_ACTIVE', trainingActive?'1':'0');
       localStorage.setItem('DI_APIKEY', apiKey); localStorage.setItem('DI_MODEL_NAME', modelName);
       updateChatUI(); if (els.togglePanel) els.togglePanel.classList.remove('active');
       if(typeof STATE !== 'undefined') { STATE.user = userName; updateInterface(userName); saveData(); }
       showToaster('Configurações salvas', 'success');
    });
    if (els.closePanelBtn) els.closePanelBtn.addEventListener('click', ()=> { if (els.togglePanel) els.togglePanel.classList.remove('active'); });

    document.getElementById('crystalBtn').addEventListener('click', ()=>{ refreshCrystalList(); document.getElementById('crystalModal').classList.add('active'); });
    document.getElementById('closeCrystal').addEventListener('click', ()=>document.getElementById('crystalModal').classList.remove('active'));
    document.getElementById('exportAllCrystal').addEventListener('click', ()=>{
        const list = JSON.parse(localStorage.getItem(CRYSTAL_KEY)||'[]');
        if(!list.length) return alert('Nada.');
        const b = new Blob([JSON.stringify(list,null,2)], {type:'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download='crystals.json'; a.click();
    });
    document.getElementById('clearAllCrystal').addEventListener('click', ()=>{ localStorage.removeItem(CRYSTAL_KEY); refreshCrystalList(); });

    // copy / paste
    const copyBtn = document.querySelector('.control-btn.copy-button');
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      try {
        const blocks = Array.from(document.querySelectorAll('.response-block p')).map(p=>p.innerText.trim()).filter(Boolean);
        const text = blocks.length ? blocks.join('\n\n') : document.getElementById('response').innerText.trim();
        await navigator.clipboard.writeText(text);
        showToaster('Texto copiado', 'success');
      } catch (e) { showToaster('Falha ao copiar', 'error'); console.error(e); }
    });
    const pasteBtn = document.querySelector('.control-btn.paste-button');
    if (pasteBtn) pasteBtn.addEventListener('click', async () => {
      try {
        const txt = await navigator.clipboard.readText();
        const ui = document.getElementById('userInput');
        if (ui) { ui.value = txt; ui.focus(); showToaster('Conteúdo colado no campo', 'success'); }
      } catch (e) { showToaster('Falha ao colar (permissão negada?)', 'error'); console.error(e); }
    });

    // activation copy
    const copyAct = document.getElementById('copyActBtn');
    if (copyAct) copyAct.addEventListener('click', async () => {
      try {
        const txt = document.getElementById('actPre').innerText;
        await navigator.clipboard.writeText(txt);
        showToaster('Ativação copiada', 'success');
      } catch(e){ showToaster('Erro ao copiar ativação', 'error'); console.error(e); }
    });

    // training import/export
    if (els.importTrainingBtn && els.trainingUpload) {
      els.importTrainingBtn.addEventListener('click', ()=> els.trainingUpload.click());
      els.trainingUpload.addEventListener('change', async (ev)=> {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        const txt = await f.text();
        training = txt;
        trainingFileName = f.name;
        localStorage.setItem('DI_TRAINING_TEXT', training);
        localStorage.setItem('DI_TRAINING_FILENAME', trainingFileName);
        if (els.trainingFileName) els.trainingFileName.innerText = trainingFileName;
        showToaster('Treinamento importado', 'success');
      });
    }
    if (els.exportTrainingBtn) els.exportTrainingBtn.addEventListener('click', ()=> {
      if (!training) { showToaster('Nenhum treinamento para exportar', 'error'); return; }
      const b = new Blob([training], { type: 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (trainingFileName||'training.txt'); a.click();
    });

    // keys import/export
    if (els.exportKeysBtn) els.exportKeysBtn.addEventListener('click', ()=> {
      const b = new Blob([JSON.stringify(STATE.keys || [], null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'keys.json'; a.click();
    });
    if (els.importKeysBtn && els.importFileInput) {
      els.importKeysBtn.addEventListener('click', ()=> els.importFileInput.click());
      els.importFileInput.addEventListener('change', async (ev)=> {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        try {
          const txt = await f.text();
          const parsed = JSON.parse(txt);
          if (!Array.isArray(parsed)) throw new Error('Formato inválido');
          STATE.keys = parsed;
          saveData(); renderKeysList(); showToaster('Chaves importadas', 'success');
        } catch (e) { showToaster('Erro ao importar chaves', 'error'); console.error(e); }
      });
    }

    // modes
    function setModeElectron() {
      document.body.classList.remove('low-power');
      showToaster('Modo Elétron ativado — visual completo', 'success');
    }
    function setModeNeutron() {
      document.body.classList.add('low-power');
      showToaster('Modo Nêutron ativado — economia de recursos', 'success');
    }
    if (els.modeElectron) els.modeElectron.addEventListener('click', setModeElectron);
    if (els.modeNeutron) els.modeNeutron.addEventListener('click', setModeNeutron);

    // init values
    updateChatUI();
    loadData();
    setTimeout(()=>{ if (els.card) els.card.classList.add('active'); if (els.avatarTgt) els.avatarTgt.classList.add('shown'); }, 120);
    setInterval(()=>{ if (els.clock) els.clock.innerText = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); },1000);

    // service worker (single registration)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(()=> console.log('Service Worker Registered'))
        .catch(e=> console.warn('SW register failed', e));
    }
  }); // end DOMContentLoaded

})();
