/** Community adaptation of Obsidian Prism. Modified 2026-11-22. SPDX-License-Identifier: GPL-3.0-only */
(function () {
  'use strict';
  // Separate viewport-responsive options from the intrinsically sized action
  // popup before rendering controls or starting asynchronous extension reads.
  const isOptionsPage = new URLSearchParams(location.search).get('mode')==='options';
  document.documentElement.classList.toggle('is-options-document',isOptionsPage);
  document.body.classList.toggle('is-options-page',isOptionsPage);
  if(isOptionsPage) document.getElementById('btn-open-options').hidden=true;
  const Schema = globalThis.ObsidianPrismSchema;
  const api = Schema.getExtApi();
  let confirmed = {...Schema.DEFAULT_CONFIG};
  let current = {...confirmed};
  let revision = 0;
  const pending = new Map();
  let saves = Promise.resolve();
  let rangeTimer = null;
  let activeTab = 'appearance';
  let previewSite = 'chatgpt';
  let keyConfigured = false;
  let permissionRevision = 0;
  let keyStatusEndpoint = null;
  let keyStatusRevision = 0;
  let statusKey = '';
  let statusIsError = false;
  const $ = id => document.getElementById(id);
  const tr = key => Schema.t(current,key);
  const text = key => '<span data-i18n="'+key+'">'+Schema.t(Schema.DEFAULT_CONFIG,key)+'</span>';
  const hint = key => key ? '<small data-i18n="'+key+'">'+Schema.t(Schema.DEFAULT_CONFIG,key)+'</small>' : '';
  const toggle = (key,description) => '<div class="row-field"><label for="cfg-'+key+'">'+text(key)+hint(description)+'</label><input class="switch" role="switch" type="checkbox" id="cfg-'+key+'"></div>';
  const options = list => list.map(([value,key]) => '<option value="'+value+'"'+(key ? ' data-i18n="'+key+'"' : '')+'>'+(key ? Schema.t(Schema.DEFAULT_CONFIG,key) : value)+'</option>').join('');
  const select = (key,label,list,description,row) => '<div class="'+(row?'row-field':'field')+'"><label class="'+(row?'':'field-label')+'" for="cfg-'+key+'">'+text(label)+ (row?hint(description):'')+'</label><select id="cfg-'+key+'">'+options(list)+'</select>'+(!row?hint(description):'')+'</div>';
  const intro = (title,description) => '<div class="section-intro"><h2 data-i18n="'+title+'">'+Schema.t(Schema.DEFAULT_CONFIG,title)+'</h2><p data-i18n="'+description+'">'+Schema.t(Schema.DEFAULT_CONFIG,description)+'</p></div>';
  const palettes = {
    obsidian:{key:'palObsidian',bg:'#0e0e11',side:'#09090b',card:'#1c1c22',fg:'#f2f2f5',muted:'#8a8a98'},
    warm:{key:'palWarm',bg:'#141413',side:'#10100f',card:'#22201d',fg:'#f2efe9',muted:'#a39e93'},
    crystal:{key:'palCrystal',bg:'#f4f7fb',side:'#e8eef6',card:'#e9eff8',fg:'#0f172a',muted:'#5b6b82'},
    alabaster:{key:'palAlabaster',bg:'#f6f4ee',side:'#ebe6dc',card:'#efece3',fg:'#1c1814',muted:'#6b6257'}
  };
  function paletteCard(name,key) {
    const p = palettes[name];
    return '<label class="palette" style="--sample-bg:'+p.bg+';--sample-side:'+p.side+';--sample-fg:'+p.fg+'"><input type="radio" name="'+key+'" value="'+name+'" data-palette-key="'+key+'"><span class="palette-mini" aria-hidden="true"><i></i><span></span></span><span class="palette-name">'+text(p.key)+'</span></label>';
  }
  const card = (title,body,headerControl='') => '<div class="settings-card"><div class="card-heading"><h2 data-i18n="'+title+'">'+Schema.t(Schema.DEFAULT_CONFIG,title)+'</h2>'+headerControl+'</div>'+body+'</div>';
  const compactSelect = (key,list,label) => '<select id="cfg-'+key+'" aria-label="'+Schema.t(Schema.DEFAULT_CONFIG,label||key)+'" data-label="'+(label||key)+'">'+options(list)+'</select>';
  const native = key => '<label class="native-row"><input type="checkbox" data-native="'+key+'"><span class="native-prefix">'+text(key==='palette'?'modeDark':'modeLight')+'</span>'+text('palHost')+'</label>';
  const accents = '<div class="field"><span class="field-label" data-i18n="accentTone"></span><div class="swatches">'+[['follow','accFollow','linear-gradient(135deg,#6ac6ac,#a58af8)'],['cobalt','accCobalt','#669df6'],['iris','accIris','#a58af8'],['amber','accAmber','#f2b84b'],['mono','accMono','#aeb4c1']].map(([value,label,color])=>'<button type="button" class="swatch" data-accent="'+value+'" aria-pressed="false" style="--swatch:'+color+'"><i aria-hidden="true"></i>'+text(label)+'</button>').join('')+'</div></div>';
  $('panel-appearance').innerHTML = card('themeSection',
    '<div class="palette-grid">'+paletteCard('obsidian','palette')+paletteCard('warm','palette')+paletteCard('crystal','lightPreset')+paletteCard('alabaster','lightPreset')+'</div><div class="native-options">'+native('palette')+native('lightPreset')+'</div>'+accents+
    '<button type="button" class="atmosphere-link" id="btn-atmosphere">'+text('atmosphereShortcut')+'<span aria-hidden="true">↗</span></button>',compactSelect('themeMode',[['auto','modeAuto'],['dark','modeDark'],['light','modeLight']]))+
    card('layoutTitle',select('sidebarStyle','sidebarStyle',[['glass','sidebarGlass'],['solid','sidebarSolid'],['native','sidebarNative']],null,true)+toggle('sidebarCompact')+toggle('composerRestyle')+toggle('composerGlow','composerGlowHint'))+
    card('detailsSection','<div class="two-fields">'+select('cornerStyle','cornerStyle',[['sharp','cornerSharp'],['balanced','cornerBalanced'],['soft','cornerSoft']])+select('language','languageLabel',[['zh-CN',null],['en-US',null]])+'</div>');
  $('cfg-language').options[0].textContent='简体中文'; $('cfg-language').options[1].textContent='English';
  $('panel-reading').innerHTML = intro('readingTitle','readingHint')+card('tabWorkbench',select('contentWidth','contentWidth',[['standard','widthStandard'],['wide','widthWide'],['full','widthFull']],'contentWidthHint',true)+toggle('railOutline','railHint')+toggle('turnJumpShortcuts','shortcutHint')+toggle('stickyCodeHeader')+toggle('longCodeFold','longCodeFoldHint'))+
    card('contextVial',toggle('contextVial','contextHint')+select('contextWindowTokens','contextWindow',[['auto','contextWindowAuto'],[32000,null],[128000,null],[200000,null],[400000,null],[512000,null],[1000000,null],[2000000,null]],null,true))+
    card('codeFont',select('codeFont','codeFont',[['default','fontDefault'],['jetbrains',null],['fira',null],['cascadia',null]],'fontHint')+toggle('codeLigatures'));
  const fonts = {'jetbrains':'JetBrains Mono','fira':'Fira Code','cascadia':'Cascadia Code'};
  for(const option of $('cfg-codeFont').options) if(fonts[option.value]) option.textContent=fonts[option.value];
  for(const option of $('cfg-contextWindowTokens').options) if(option.value!=='auto') option.textContent=Number(option.value).toLocaleString();
  const atmosphereCards='<div class="atmosphere-cards">'+[['aurora','styleAurora'],['spotlight','styleSpotlight'],['none','styleNone']].map(([value,label])=>'<button type="button" class="atmosphere-card" data-choice="ambientStyle" data-value="'+value+'" aria-pressed="false"><i aria-hidden="true"></i>'+text(label)+'</button>').join('')+'</div>';
  $('panel-motion').innerHTML = intro('motionTitle','motionHint')+card('ambientStyle',atmosphereCards+
    '<div class="field"><div class="range-label"><label class="field-label" for="cfg-ambientIntensity" data-i18n="ambientIntensity"></label><output for="cfg-ambientIntensity" id="val-ambientIntensity">65%</output></div><input type="range" id="cfg-ambientIntensity" min="0" max="100" step="1"><div class="range-track-labels"><span>0%</span><span>100%</span></div></div>'+
    select('ambientTexture','ambientTexture',[['off','textureOff'],['grid','textureGrid'],['glyphs','textureGlyphs']],null,true),compactSelect('ambientStyle',[['aurora','styleAurora'],['spotlight','styleSpotlight'],['none','styleNone']]))+
    card('motionLevel',select('motionLevel','motionLevel',[['ultra','motionUltra'],['subtle','motionSubtle'],['off','motionOff']],null,true)+select('motionSpeed','motionSpeed',[['slow','speedSlow'],['normal','speedNormal'],['fast','speedFast']],null,true)+'<div class="motion-status"><i aria-hidden="true"></i><span id="motion-status"></span></div>'+toggle('streamChoreography','streamHint')+toggle('semanticAura'));
  $('panel-translation').innerHTML = intro('translationTitle','translationHint')+card('tabThought',toggle('thoughtTranslate')+
    select('thoughtView','thoughtView',[['bilingual','viewBilingual'],['immersive','viewImmersive']],null,true)+
    '<div class="field"><label class="field-label" for="cfg-thoughtEndpoint" data-i18n="thoughtEndpoint"></label><input type="url" id="cfg-thoughtEndpoint" spellcheck="false" autocomplete="off" placeholder="http://localhost:11434/v1/chat/completions" maxlength="2048">'+hint('endpointHint')+'</div>'+
    '<div class="field"><label class="field-label" for="cfg-thoughtModel" data-i18n="thoughtModel"></label><input type="text" id="cfg-thoughtModel" autocomplete="off" spellcheck="false" placeholder="qwen3:8b" maxlength="160"></div>'+
    '<div class="notice"><p data-i18n="permissionHint"></p><div class="button-row"><button type="button" class="primary" id="grant-permission" data-i18n="grantAccess"></button><button type="button" id="revoke-permission" data-i18n="revokeAccess"></button></div><div id="permission-status" class="permission-status" role="status"></div></div>'+
    '<div class="field"><label class="field-label" for="api-key" data-i18n="thoughtApiKey"></label><input type="password" id="api-key" autocomplete="new-password" spellcheck="false" maxlength="4096">'+hint('keyHint')+'<div id="key-status" class="key-status"></div><div class="button-row"><button type="button" id="save-key" data-i18n="saveKey"></button><button type="button" id="clear-key" data-i18n="clearKey"></button></div></div>');
  $('panel-about').innerHTML = card('creditsTitle','<div class="credits"><p data-i18n="creditsBody"></p><p data-i18n="independentNote"></p><div class="links"><a href="https://github.com/RMvdesi/obsidian-prism" target="_blank" rel="noreferrer" data-i18n="upstream"></a><a href="https://github.com/bahayonghang/obsidian-prism-chrome-plugin" target="_blank" rel="noreferrer" data-i18n="source"></a><a href="../LICENSE" target="_blank" data-i18n="license"></a><a href="../NOTICE" target="_blank" data-i18n="notices"></a><a href="../THIRD_PARTY_NOTICES.md" target="_blank" data-i18n="thirdParties"></a><a href="../PRIVACY.md" target="_blank" data-i18n="privacy"></a></div></div><div class="notice"><p data-i18n="privacyNote"></p></div>')+
    card('backupTitle','<p class="preview-note" data-i18n="backupHint"></p><div class="button-row"><button type="button" id="btn-export" data-i18n="btnExport"></button><button type="button" id="btn-import" data-i18n="btnImport"></button><button type="button" class="danger" id="btn-reset" data-i18n="btnReset"></button></div><input class="file-input" type="file" id="file-import" accept="application/json,.json">');
  function status(key,error) { statusKey=key;statusIsError=Boolean(error);$('status-msg').textContent=tr(key);$('status-msg').dataset.error=String(statusIsError); }
  function translateLabels() {
    document.documentElement.lang=current.language;
    $('status-msg').textContent=statusKey?tr(statusKey):'';
    $('status-msg').dataset.error=String(statusIsError);
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent=tr(node.dataset.i18n);
    for (const node of document.querySelectorAll('[data-title]')) {node.title=tr(node.dataset.title);node.setAttribute('aria-label',tr(node.dataset.title));}
    $('key-status').textContent=tr(keyConfigured?'keySaved':'keyEmpty');
    document.querySelector('.tabs').setAttribute('aria-label',tr('controlsLabel'));
    document.querySelector('.preset-row').setAttribute('aria-label',tr('scenePresets'));
    document.querySelector('.preview-sites').setAttribute('aria-label',tr('previewSite'));
    for(const node of document.querySelectorAll('[data-label]')) node.setAttribute('aria-label',tr(node.dataset.label));
  }
  function preview(overrides={}) {
    const view={...current,...overrides};
    const scheme=Schema.resolveScheme(view), name=Schema.resolvePalette(view);
    const p=palettes[name] || palettes[scheme==='dark'?'obsidian':'crystal'];
    const element=$('chat-preview'),style=element.style;
    for(const key of ['bg','side','card','fg','muted']) style.setProperty('--preview-'+key,p[key]);
    const dark=scheme==='dark';
    style.setProperty('--preview-accent',({follow:previewSite==='chatgpt'?(dark?'#34d399':'#0d9488'):(dark?'#7baaf7':'#2563eb'),cobalt:dark?'#669df6':'#2563eb',iris:dark?'#a58af8':'#7c3aed',amber:dark?'#f2b84b':'#b45309',mono:dark?'#d4d7e0':'#334155'})[view.accentTone]);
    style.setProperty('--preview-radius',({sharp:'5px',balanced:'10px',soft:'17px'})[view.cornerStyle]);
    style.setProperty('--preview-strength',String(view.ambientIntensity/100));
    style.setProperty('--preview-duration',({slow:'42s',normal:'28s',fast:'17s'})[view.motionSpeed]);
    const reduced=globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.dataset.motion=reduced?'off':view.motionLevel;
    element.dataset.visible=String(!document.hidden);
    element.dataset.ambient=view.ambientStyle;element.dataset.texture=view.ambientTexture;
    element.dataset.sidebar=view.sidebarStyle;element.dataset.glow=String(view.composerGlow);
    element.dataset.composer=String(view.composerRestyle);element.dataset.compact=String(view.sidebarCompact);
    $('preview-host-name').textContent=previewSite==='chatgpt'?'ChatGPT':'Gemini';
    const statusKey=view.ambientStyle==='none'&&view.ambientTexture==='off'?'effectNone':reduced?'effectsReduced':view.motionLevel==='off'?'effectsPaused':'effectsActive';
    $('effect-status').textContent=tr(statusKey);
    $('motion-status').textContent=tr(reduced?'effectsReduced':view.motionLevel==='off'?'effectsPaused':'effectsActive');
    $('preview-note').textContent=!view.enabled?tr('previewDisabled'):name==='host'?tr('previewNative'):'';
    for(const button of document.querySelectorAll('[data-preview-site]')) button.setAttribute('aria-pressed',String(button.dataset.previewSite===previewSite));
  }
  function render() {
    current={...confirmed}; for(const [key,entry] of pending) current[key]=entry.value;
    Schema.applyConfigToRoot({...current,enabled:true});
    for(const key of Object.keys(Schema.DEFAULT_CONFIG)) {
      const node=$('cfg-'+key); if(!node) continue;
      if(node.type==='checkbox') node.checked=current[key];
      else if(document.activeElement!==node || node.tagName==='SELECT') node.value=String(current[key]);
    }
    for(const radio of document.querySelectorAll('[data-palette-key]')) {radio.checked=current[radio.dataset.paletteKey]===radio.value;radio.closest('.palette').dataset.active=String(Schema.resolvePalette(current)===radio.value);}
    for(const button of document.querySelectorAll('[data-choice]')) button.setAttribute('aria-pressed',String(current[button.dataset.choice]===button.dataset.value));
    for(const button of document.querySelectorAll('[data-preset]')) button.setAttribute('aria-pressed',String(Object.entries(Schema.SCENE_PRESETS[button.dataset.preset]).every(([key,value])=>current[key]===value)));
    for(const box of document.querySelectorAll('[data-native]')) box.checked=current[box.dataset.native]==='host';
    for(const swatch of document.querySelectorAll('[data-accent]')) swatch.setAttribute('aria-pressed',String(swatch.dataset.accent===current.accentTone));
    $('val-ambientIntensity').textContent=current.ambientIntensity+'%';
    translateLabels();preview();checkPermission();
    if(keyStatusEndpoint!==current.thoughtEndpoint) checkKeyStatus();
  }
  function save(patch) {
    const stamp=++revision;
    for(const [key,value] of Object.entries(patch)) pending.set(key,{stamp,value});
    render();status('statusSaving');
    const task=saves.then(()=>Schema.saveConfig(patch));
    saves=task.catch(()=>{});
    return task.then(config=>{
      confirmed=config;
      for(const key of Object.keys(patch)) if(pending.get(key)?.stamp===stamp) pending.delete(key);
      render();if(!pending.size) status('statusSaved');return config;
    }).catch(error=>{
      for(const key of Object.keys(patch)) if(pending.get(key)?.stamp===stamp) pending.delete(key);
      render();status('statusError',true);throw error;
    });
  }
  function queueSave(patch) {save(patch).catch(()=>{});}
  function switchTab(name,focus) {
    activeTab=name;document.body.dataset.activeTab=name;
    $('settings-scroll').scrollTop=0;
    for(const button of document.querySelectorAll('[data-tab]')) {const active=button.dataset.tab===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus) button.focus();}
    for(const panel of document.querySelectorAll('[role=tabpanel]')) panel.hidden=panel.id!=='panel-'+name;
    if(name==='translation') checkPermission();
  }
  for(const button of document.querySelectorAll('[data-tab]')) {
    button.addEventListener('click',()=>switchTab(button.dataset.tab,false));
    button.addEventListener('keydown',event=>{
      const tabs=[...document.querySelectorAll('[data-tab]')];let index=tabs.indexOf(button);
      if(event.key==='ArrowRight') index=(index+1)%tabs.length;
      else if(event.key==='ArrowLeft') index=(index+tabs.length-1)%tabs.length;
      else if(event.key==='Home') index=0;else if(event.key==='End') index=tabs.length-1;else return;
      event.preventDefault();switchTab(tabs[index].dataset.tab,true);
    });
  }
  for(const key of Object.keys(Schema.DEFAULT_CONFIG)) {
    const input=$('cfg-'+key);if(!input) continue;
    input.addEventListener('change',()=>{
      if(key==='ambientIntensity') {clearTimeout(rangeTimer);queueSave({ambientIntensity:Number(input.value)});return;}
      const value=input.type==='checkbox'?input.checked:key==='contextWindowTokens'?(input.value==='auto'?'auto':Number(input.value)):input.value;
      if(key==='thoughtEndpoint' && input.value.trim() && !Schema.validEndpoint(input.value)) {status('endpointRequired',true);return;}
      queueSave({[key]:value});
    });
  }
  $('cfg-ambientIntensity').addEventListener('input',()=>{
    const value=Number($('cfg-ambientIntensity').value);
    $('val-ambientIntensity').textContent=value+'%';preview({ambientIntensity:value});
    clearTimeout(rangeTimer);rangeTimer=setTimeout(()=>queueSave({ambientIntensity:value}),120);
  });
  $('btn-atmosphere').addEventListener('click',()=>switchTab('motion',true));
  for(const button of document.querySelectorAll('[data-choice]')) button.addEventListener('click',()=>queueSave({[button.dataset.choice]:button.dataset.value}));
  for(const button of document.querySelectorAll('[data-preview-site]')) button.addEventListener('click',()=>{previewSite=button.dataset.previewSite;preview();});
  for(const radio of document.querySelectorAll('[data-palette-key]')) radio.addEventListener('change',()=>queueSave({[radio.dataset.paletteKey]:radio.value,themeMode:radio.dataset.paletteKey==='palette'?'dark':'light'}));
  for(const box of document.querySelectorAll('[data-native]')) box.addEventListener('change',()=>queueSave({[box.dataset.native]:box.checked?'host':box.dataset.native==='palette'?'obsidian':'crystal'}));
  for(const button of document.querySelectorAll('[data-accent]')) button.addEventListener('click',()=>queueSave({accentTone:button.dataset.accent}));
  for(const button of document.querySelectorAll('[data-preset]')) button.addEventListener('click',()=>queueSave(Schema.SCENE_PRESETS[button.dataset.preset]));
  async function checkPermission() {
    const stamp=++permissionRevision;
    let granted=false;
    try {if(current.thoughtEndpoint) granted=await Schema.callApi(api.permissions,'contains',Schema.permissionRequest(current.thoughtEndpoint));} catch (_) {}
    if(stamp!==permissionRevision) return;
    $('permission-status').textContent=tr(granted?'permissionGranted':'permissionMissing');
    $('permission-status').dataset.granted=String(granted);
  }
  $('grant-permission').addEventListener('click',()=>{
    const endpoint=Schema.validEndpoint($('cfg-thoughtEndpoint').value);
    if(!endpoint) {status('endpointRequired',true);return;}
    // Invoke request synchronously from the click so the browser retains the user gesture.
    const request=Schema.callApi(api.permissions,'request',Schema.permissionRequest(endpoint));
    request.then(async granted=>{
      if(!granted) {status('permissionDenied',true);return;}
      await save({thoughtEndpoint:endpoint,thoughtModel:$('cfg-thoughtModel').value});await checkPermission();
    }).catch(()=>status('permissionDenied',true));
  });
  $('revoke-permission').addEventListener('click',()=>{
    const endpoint=Schema.validEndpoint($('cfg-thoughtEndpoint').value);
    if(!endpoint) {status('endpointRequired',true);return;}
    Schema.callApi(api.permissions,'remove',Schema.permissionRequest(endpoint)).then(()=>save({thoughtTranslate:false})).then(checkPermission).catch(()=>status('unknownError',true));
  });
  async function checkKeyStatus() {
    const stamp=++keyStatusRevision;keyStatusEndpoint=current.thoughtEndpoint;
    try {const response=await Schema.sendMessage({type:'OP_SECRETS_STATUS'});if(stamp!==keyStatusRevision)return;keyConfigured=response.configured;translateLabels();}catch(_){}
  }
  async function updateKey(value) {
    if(value && !Schema.validEndpoint($('cfg-thoughtEndpoint').value)) {status('endpointRequired',true);return;}
    try {await saves;const response=await Schema.sendMessage({type:'OP_SECRETS_SET',apiKey:value});keyConfigured=response.configured;$('api-key').value='';translateLabels();status('statusSaved');} catch (_) {status('statusError',true);}
  }
  $('save-key').addEventListener('click',()=>updateKey($('api-key').value));
  $('clear-key').addEventListener('click',()=>updateKey(''));
  $('btn-open-options').addEventListener('click',()=>Schema.sendMessage({type:'OP_OPEN_OPTIONS'}).catch(()=>status('unknownError',true)));
  $('btn-export').addEventListener('click',async()=>{
    try {
      await saves;const cfg=await Schema.loadConfig();
      const blob=new Blob([JSON.stringify({format:'obsidian-prism-web',version:1,settings:cfg},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='obsidian-prism-web-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(_){status('unknownError',true);}
  });
  $('btn-import').addEventListener('click',()=>$('file-import').click());
  $('file-import').addEventListener('change',async()=>{
    const file=$('file-import').files[0];$('file-import').value='';if(!file)return;
    if(file.size>65536){status('importTooLarge',true);return;}
    try {
      const parsed=JSON.parse(await file.text());
      const raw=parsed&&parsed.format==='obsidian-prism-web'?parsed.settings:parsed;
      if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error('INVALID');
      const clean=Schema.sanitizePatch(raw);
      const known=Object.keys(raw).filter(key=>Object.prototype.hasOwnProperty.call(Schema.DEFAULT_CONFIG,key));
      if(!known.length||known.some(key=>!Object.prototype.hasOwnProperty.call(clean,key))) throw new Error('INVALID');
      // Importing a file must never silently enable external text transmission.
      clean.thoughtTranslate=false;
      await save(clean);status('importSuccess');
    }catch(_){status('importInvalid',true);}
  });
  $('btn-reset').addEventListener('click',async()=>{
    if(!window.confirm(tr('resetConfirm')))return;
    try {await saves;const result=await Schema.sendMessage({type:'OP_CONFIG_RESET'});confirmed=result.config;pending.clear();render();status('statusSaved');}catch(_){status('statusError',true);}
  });
  Schema.subscribe(cfg=>{confirmed=cfg;render();});
  try {$('version-label').textContent=api.runtime.getManifest().version;}catch(_){}
  render();
  Schema.loadConfig().then(async config=>{
    confirmed=config;render();$('settings-fields').disabled=false;status('statusSaved');
    try {keyConfigured=(await Schema.sendMessage({type:'OP_SECRETS_STATUS'})).configured;translateLabels();}catch(_){}
  }).catch(()=>status('loadError',true));
  document.addEventListener('visibilitychange',()=>preview());
  if(globalThis.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change',render);
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',render);
  }
})();
