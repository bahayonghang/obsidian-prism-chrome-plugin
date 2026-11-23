/**
 * Obsidian Prism Web — shared configuration and extension API bridge.
 * Community adaptation of RMvdesi/obsidian-prism. Modified 2026-11-21.
 * SPDX-License-Identifier: GPL-3.0-only
 */
(function (global) {
  'use strict';
  const STORAGE_KEY = 'obsidianPrismWebConfig_v1';
  const SECRETS_KEY = 'obsidianPrismWebSecrets_v1';
  const DATA_PERMISSIONS = ['websiteContent', 'personalCommunications', 'authenticationInfo'];
  const DEFAULT_CONFIG = Object.freeze({
    enabled: true, enableChatGPT: true, enableGemini: true, language: 'zh-CN',
    themeMode: 'auto', palette: 'obsidian', lightPreset: 'crystal', accentTone: 'follow',
    cornerStyle: 'balanced', codeFont: 'default', codeLigatures: false,
    ambientIntensity: 65, ambientStyle: 'aurora', ambientTexture: 'glyphs',
    motionSpeed: 'slow', composerGlow: true, sidebarStyle: 'glass',
    motionLevel: 'subtle', streamChoreography: true,
    semanticAura: true, composerRestyle: true, sidebarCompact: false,
    stickyCodeHeader: true, longCodeFold: true, railOutline: true,
    turnJumpShortcuts: true, contentWidth: 'standard', contextVial: true, contextWindowTokens: 'auto',
    thoughtTranslate: false, thoughtView: 'bilingual',
    thoughtEndpoint: '', thoughtModel: ''
  });
  const ENUMS = Object.freeze({
    language: ['zh-CN', 'en-US'], themeMode: ['auto', 'dark', 'light'],
    palette: ['obsidian', 'warm', 'host'], lightPreset: ['crystal', 'alabaster', 'host'],
    accentTone: ['follow', 'cobalt', 'iris', 'amber', 'mono'],
    cornerStyle: ['sharp', 'balanced', 'soft'], codeFont: ['default', 'jetbrains', 'fira', 'cascadia'],
    motionLevel: ['ultra', 'subtle', 'off'],
    ambientStyle: ['aurora', 'spotlight', 'none'], ambientTexture: ['off', 'grid', 'glyphs'],
    motionSpeed: ['slow', 'normal', 'fast'], sidebarStyle: ['glass', 'solid', 'native'],
    contentWidth: ['standard', 'wide', 'full'],
    thoughtView: ['bilingual', 'immersive']
  });
  const SCENE_PRESETS = Object.freeze({
    ultra: Object.freeze({motionLevel: 'ultra', motionSpeed: 'slow', ambientStyle: 'aurora', ambientTexture: 'glyphs', composerGlow: true, sidebarStyle: 'glass', streamChoreography: true, semanticAura: true, sidebarCompact: false, ambientIntensity: 85}),
    focus: Object.freeze({motionLevel: 'subtle', motionSpeed: 'slow', ambientStyle: 'spotlight', ambientTexture: 'off', composerGlow: true, sidebarStyle: 'solid', streamChoreography: true, semanticAura: true, sidebarCompact: true, ambientIntensity: 45}),
    eco: Object.freeze({motionLevel: 'off', motionSpeed: 'slow', ambientStyle: 'none', ambientTexture: 'off', composerGlow: false, sidebarStyle: 'solid', streamChoreography: false, semanticAura: false, sidebarCompact: false, ambientIntensity: 0})
  });
  const I18N = Object.freeze({
    'zh-CN': {
      appTitle:'黑曜棱镜', appSub:'为每一次对话，换一种光。', independent:'ChatGPT 与 Gemini · 社区移植版',
      masterEnable:'启用 Prism', masterHint:'随时关闭，恢复网页原有外观', hostChatGPT:'ChatGPT',hostGemini:'Gemini',
      tabAppearance:'外观',tabWorkbench:'阅读',tabMotion:'光影',tabThought:'翻译',tabAbout:'关于',
      scenePresets:'一键场景',presetUltra:'流光',presetFocus:'专注',presetEco:'静默',
      themeMode:'明暗模式',modeAuto:'跟随系统',modeDark:'深色',modeLight:'浅色',
      darkPalette:'深色配色',lightPalette:'浅色配色',palObsidian:'深空黑曜',palWarm:'暖炭玄岩',palCrystal:'白昼冷晶',palAlabaster:'暖白画册',palHost:'保留原生配色',
      paletteHint:'选择色卡可立即预览对应的明暗模式。',accentTone:'点睛色',accFollow:'跟随站点',accCobalt:'钴蓝',accIris:'鸢尾紫',accAmber:'琥珀金',accMono:'银钛',
      cornerStyle:'圆角',cornerSharp:'利落',cornerBalanced:'均衡',cornerSoft:'柔和',languageLabel:'界面语言',
      previewTitle:'外观预览',previewPrompt:'让复杂的想法变得清楚。',previewReply:'从一个小问题开始，再慢慢深入。',previewInput:'继续探索…',previewBadge:'样式预览',
      readingTitle:'把长对话读得轻松一点',readingHint:'增强控件仅作用于支持的网站。',
      stickyCodeHeader:'固定代码标题栏',longCodeFold:'手动折叠长代码',longCodeFoldHint:'48 行起显示折叠按钮，原文保持完整。',
      railOutline:'会话大纲',railHint:'按提问查找与跳转。',turnJumpShortcuts:'Alt + ↑ / ↓ 跳转提问',shortcutHint:'输入文字时不会抢占按键。',
      contentWidth:'内容宽度',contentWidthHint:'切换标准、加宽与全栏阅读列。',widthStandard:'标准',widthWide:'加宽',widthFull:'全栏',widthToggleLabel:'切换内容宽度',
      contextVial:'上下文估算',contextHint:'仅估算已加载的对话，不代表实际用量、额度或模型容量。',contextWindow:'参考容量',contextWindowAuto:'自动匹配模型',
      codeFont:'代码字体',fontDefault:'系统等宽字体',fontHint:'使用本机已安装字体；找不到时自动回退。',codeLigatures:'代码连字',
      sidebarCompact:'紧凑侧栏',composerRestyle:'输入框外观',motionTitle:'让背景有光，也有呼吸',motionHint:'极光、聚光与纹理可以独立调节。系统减少动态效果时，保留静态光影。',
      motionLevel:'动效强度',motionUltra:'完整',motionSubtle:'轻柔',motionOff:'关闭',ambientIntensity:'环境光浓度',
      streamChoreography:'新回复文字淡入',streamHint:'浏览器支持时启用，不改写回复内容。',semanticAura:'回复活动余晖',
      ambientStyle:'背景光场',styleAurora:'底部极光',styleSpotlight:'柔光聚焦',styleNone:'关闭光晕',ambientTexture:'背景纹理',textureOff:'无纹理',textureGrid:'微光网格',textureGlyphs:'字符矩阵',motionSpeed:'流动速度',speedSlow:'缓慢',speedNormal:'标准',speedFast:'轻快',composerGlow:'输入框光晕',composerGlowHint:'聚焦输入时，边缘与底部柔和发光。',sidebarStyle:'侧栏样式',sidebarGlass:'透光',sidebarSolid:'纯色',sidebarNative:'原生',layoutTitle:'侧栏与输入框',layoutHint:'细边框、柔和层次，以及更清楚的当前会话。',atmosphereShortcut:'调整背景光影',effectSummary:'光影效果',effectsPaused:'动态效果已停止',effectsReduced:'跟随系统：静态光影',effectsActive:'光影已启用',effectNone:'背景效果已关闭',previewNative:'原生模式示意；实际颜色由网站决定。',previewDisabled:'扩展已关闭；这里只展示你保存的样式。',previewSite:'预览站点',presetUltraHint:'极光 · 字符 · 流动',presetFocusHint:'聚光 · 清晰 · 轻柔',presetEcoHint:'纯色 · 无动态',controlsLabel:'设置分类',themeSection:'主题与配色',detailsSection:'细节',appearanceHint:'先选一种底色，再加一点自己的光。',
      translationTitle:'只在你点击时翻译',translationHint:'默认关闭。点击页面上的翻译按钮后，已显示的思考文本会发送到你配置的服务；该服务可能收费。不会读取隐藏思考。',
      thoughtTranslate:'启用可见思考翻译',thoughtView:'译文视图',viewBilingual:'双语对照',viewImmersive:'只看译文',
      thoughtEndpoint:'兼容接口完整地址',endpointHint:'HTTPS；仅本机 localhost / 127.0.0.1 允许 HTTP。填写完整的 /chat/completions 地址。',
      thoughtModel:'模型名称',thoughtApiKey:'API Key',keyHint:'密钥仅保存在扩展中并绑定当前完整接口地址，不写入网页或导出配置。更换接口后需重新保存密钥，本地服务可留空。',
      saveKey:'保存密钥',clearKey:'删除密钥',keySaved:'已保存密钥',keyEmpty:'未保存密钥',
      grantAccess:'授权此服务',revokeAccess:'撤销授权',permissionGranted:'服务已授权',permissionMissing:'尚未授权服务',permissionDenied:'未授予访问权限',
      permissionHint:'授权限定上方服务的协议和主机名（浏览器权限涵盖该主机的所有端口）。实际请求只发送到你填写的完整地址。Firefox 也会请求相应的数据发送许可。',endpointRequired:'请先填写有效的接口地址。',
      backupTitle:'随身带走你的配色',backupHint:'导入经过校验的 JSON 设置；密钥始终排除在外。',btnExport:'导出设置',btnImport:'导入设置',btnReset:'恢复默认',
      resetConfirm:'恢复默认外观和功能设置？已保存的密钥不受影响。',importSuccess:'已导入有效设置。',importInvalid:'配置文件无效，或包含不受支持的设置值。',
      importTooLarge:'配置文件不能超过 64 KB。',openFullOptions:'打开完整设置',statusSaved:'设置已保存，已打开的页面会同步更新。',statusSaving:'正在保存…',statusError:'保存失败，请重试。',loadError:'无法读取设置，请重新打开扩展。',
      creditsTitle:'来自 Prism 的光',creditsBody:'基于 RMvdesi / Obsidian Prism 的配色与视觉理念，独立适配 Chrome 与 Firefox 网页扩展。',
      upstream:'上游项目',source:'扩展源码',license:'GPL-3.0 许可证',notices:'署名与声明',thirdParties:'第三方致谢',privacy:'隐私说明',
      independentNote:'本扩展为独立社区作品，与 RMvdesi、OpenAI 或 Google 没有官方隶属或背书关系。',
      privacyNote:'主题与阅读功能在本机运行，无统计追踪。只有主动启用并点击翻译时才会连接你授权的服务。',
      outlineTitle:'会话大纲',outlineSearch:'搜索提问…',outlineEmpty:'暂无匹配的提问',foldCollapse:'收起长代码',foldExpand:'展开全部代码',linesUnit:'行',
      vialTitle:'当前会话估算',vialTotal:'估算总 Token',vialUser:'提问',vialAssistant:'回复',vialCode:'其中代码',vialCapacity:'参考容量',vialSourceAutoMatched:'自动匹配',vialSourceAutoFallback:'自动兜底',vialSourceUnrecognized:'未识别型号，可在设置中指定',vialSourceManual:'手动指定',vialUncountedAttachments:'未计入附件',vialAttachmentsUnit:'份',vialAttachmentNote:'已检测到可见附件，其真实内容未计入以上数字估算。',vialNote:'仅基于已加载文本粗略估算；不等于服务实际用量或可用额度。',
      translateBtn:'翻译已显示的思考',translating:'翻译中…',retranslateBtn:'重新翻译',toggleViewBtn:'切换译文视图',
      translationError:'翻译失败，请检查服务配置和授权。',translationConsent:'此文本将发送到设置中的服务。',translationDisabled:'请先在扩展设置中启用并授权翻译服务。',
      close:'关闭',search:'搜索',unknownError:'操作未完成，请重试。'
    },
    'en-US': {
      appTitle:'Obsidian Prism',appSub:'A different light for every conversation.',independent:'ChatGPT & Gemini · Community port',
      masterEnable:'Enable Prism',masterHint:'Turn off anytime to restore the original page',hostChatGPT:'ChatGPT',hostGemini:'Gemini',
      tabAppearance:'Appearance',tabWorkbench:'Reading',tabMotion:'Effects',tabThought:'Translate',tabAbout:'About',
      scenePresets:'Quick scenes',presetUltra:'Aurora',presetFocus:'Focus',presetEco:'Still',
      themeMode:'Color mode',modeAuto:'System',modeDark:'Dark',modeLight:'Light',darkPalette:'Dark palette',lightPalette:'Light palette',
      palObsidian:'Obsidian',palWarm:'Warm Basalt',palCrystal:'Crystal',palAlabaster:'Alabaster',palHost:'Keep native colors',paletteHint:'Choose a card to preview its light or dark mode.',
      accentTone:'Accent',accFollow:'Site',accCobalt:'Cobalt',accIris:'Iris',accAmber:'Amber',accMono:'Titanium',
      cornerStyle:'Corners',cornerSharp:'Sharp',cornerBalanced:'Balanced',cornerSoft:'Soft',languageLabel:'Language',
      previewTitle:'Appearance preview',previewPrompt:'Make complicated ideas feel clear.',previewReply:'Begin with one small question. Then go deeper.',previewInput:'Keep exploring…',previewBadge:'Style preview',
      readingTitle:'Make long conversations easier',readingHint:'Extra controls only appear on supported sites.',
      stickyCodeHeader:'Sticky code headers',longCodeFold:'Fold long code manually',longCodeFoldHint:'Adds a button at 48 lines; original text stays intact.',
      railOutline:'Conversation outline',railHint:'Find and jump to a question.',turnJumpShortcuts:'Alt + ↑ / ↓ between questions',shortcutHint:'Never takes over shortcuts while typing.',
      contentWidth:'Content width',contentWidthHint:'Switch between standard, wide, and full reading columns.',widthStandard:'Standard',widthWide:'Wide',widthFull:'Full',widthToggleLabel:'Toggle content width',
      contextVial:'Context estimate',contextHint:'Estimates loaded messages only, not actual usage, quota or model capacity.',contextWindow:'Reference capacity',contextWindowAuto:'Auto (match model)',
      codeFont:'Code font',fontDefault:'System monospace',fontHint:'Uses locally installed fonts, with a system fallback.',codeLigatures:'Code ligatures',
      sidebarCompact:'Compact sidebar',composerRestyle:'Composer styling',motionTitle:'Light with room to breathe',motionHint:'Tune the light, texture and movement separately. Reduced motion keeps a still atmosphere.',
      motionLevel:'Motion level',motionUltra:'Full',motionSubtle:'Subtle',motionOff:'Off',ambientIntensity:'Ambient glow',
      streamChoreography:'New response text fade',streamHint:'Enabled when supported; does not rewrite message text.',semanticAura:'Response activity glow',
      ambientStyle:'Light field',styleAurora:'Aurora',styleSpotlight:'Spotlight',styleNone:'No glow',ambientTexture:'Texture',textureOff:'None',textureGrid:'Grid',textureGlyphs:'Glyphs',motionSpeed:'Movement speed',speedSlow:'Slow',speedNormal:'Normal',speedFast:'Lively',composerGlow:'Composer glow',composerGlowHint:'A soft edge and underglow while the composer is focused.',sidebarStyle:'Sidebar surface',sidebarGlass:'Translucent',sidebarSolid:'Solid',sidebarNative:'Native',layoutTitle:'Sidebar & composer',layoutHint:'Quiet borders, layered surfaces and a clear active conversation.',atmosphereShortcut:'Adjust light & motion',effectSummary:'Atmosphere',effectsPaused:'Animation is off',effectsReduced:'System preference: still light',effectsActive:'Atmosphere enabled',effectNone:'Background effects are off',previewNative:'Native preview is illustrative; the site chooses its colors.',previewDisabled:'The extension is off; this shows your saved style only.',previewSite:'Preview site',presetUltraHint:'Aurora · Glyphs · Flow',presetFocusHint:'Spotlight · Calm',presetEcoHint:'Solid · Still',controlsLabel:'Settings categories',themeSection:'Theme & color',detailsSection:'Details',appearanceHint:'Choose a canvas. Then add a little light of your own.',
      translationTitle:'Translate only when you click',translationHint:'Off by default. Clicking a page translation button sends the displayed thought text to your configured service, which may charge a fee. Hidden reasoning is never accessed.',
      thoughtTranslate:'Enable visible thought translation',thoughtView:'Translation view',viewBilingual:'Bilingual',viewImmersive:'Translation only',
      thoughtEndpoint:'Full compatible API endpoint',endpointHint:'HTTPS required, except HTTP on localhost / 127.0.0.1. Include the complete /chat/completions path.',
      thoughtModel:'Model name',thoughtApiKey:'API key',keyHint:'Stored only in the extension and bound to this exact endpoint, never the page or exported settings. Save a new key after changing endpoints. Local services may leave it blank.',
      saveKey:'Save key',clearKey:'Delete key',keySaved:'Key saved',keyEmpty:'No key saved',
      grantAccess:'Allow this service',revokeAccess:'Revoke access',permissionGranted:'Service authorized',permissionMissing:'Service not authorized',permissionDenied:'Access was not granted',
      permissionHint:'Access is scoped to this service’s scheme and hostname (browser permissions cover all its ports). Requests use only your exact saved endpoint. Firefox also asks for the relevant data transmission permissions.',endpointRequired:'Enter a valid endpoint first.',
      backupTitle:'Take your colors with you',backupHint:'Import validated JSON settings. API keys are always excluded.',btnExport:'Export settings',btnImport:'Import settings',btnReset:'Reset defaults',
      resetConfirm:'Reset appearance and feature settings? Saved API keys will remain unchanged.',importSuccess:'Valid settings imported.',importInvalid:'Invalid settings file or unsupported setting values.',
      importTooLarge:'Settings files must be 64 KB or smaller.',openFullOptions:'Open full settings',statusSaved:'Settings saved. Open pages update automatically.',statusSaving:'Saving…',statusError:'Could not save. Please retry.',loadError:'Could not load settings. Reopen the extension.',
      creditsTitle:'Light borrowed from Prism',creditsBody:'Based on the palettes and visual ideas of RMvdesi / Obsidian Prism, independently adapted for Chrome and Firefox.',
      upstream:'Upstream',source:'Source code',license:'GPL-3.0 license',notices:'Attribution',thirdParties:'Third-party credits',privacy:'Privacy',
      independentNote:'An independent community project; not affiliated with or endorsed by RMvdesi, OpenAI or Google.',
      privacyNote:'Theme and reading features run locally without analytics. Only explicitly enabled, manually requested translations connect to your authorized service.',
      outlineTitle:'Conversation outline',outlineSearch:'Search questions…',outlineEmpty:'No matching questions',foldCollapse:'Fold long code',foldExpand:'Expand all code',linesUnit:'lines',
      vialTitle:'Current conversation estimate',vialTotal:'Estimated tokens',vialUser:'Questions',vialAssistant:'Replies',vialCode:'Code subset',vialCapacity:'Reference capacity',vialSourceAutoMatched:'Auto-matched',vialSourceAutoFallback:'Auto fallback',vialSourceUnrecognized:'Unrecognized model; choose a capacity in settings',vialSourceManual:'Manual',vialUncountedAttachments:'Uncounted attachments',vialAttachmentsUnit:'files',vialAttachmentNote:'Visible attachments detected; their contents are not counted above.',vialNote:'A rough estimate of loaded text; not actual service usage or remaining quota.',
      translateBtn:'Translate displayed thoughts',translating:'Translating…',retranslateBtn:'Translate again',toggleViewBtn:'Switch translation view',
      translationError:'Translation failed. Check the service configuration and permissions.',translationConsent:'This text will be sent to the service in settings.',translationDisabled:'Enable and authorize a translation service in extension settings first.',
      close:'Close',search:'Search',unknownError:'Could not complete this action. Please retry.'
    }
  });
  function getExtApi() { return typeof global.browser !== 'undefined' ? global.browser : global.chrome; }
  function callApi(object, method, ...args) {
    if (!object || typeof object[method] !== 'function') return Promise.reject(new Error('EXTENSION_API_UNAVAILABLE'));
    if (typeof global.browser !== 'undefined') {
      try { return Promise.resolve(object[method](...args)); } catch (error) { return Promise.reject(error); }
    }
    return new Promise((resolve, reject) => {
      try {
        object[method](...args, result => {
          const error = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (error) reject(new Error(error.message || 'EXTENSION_API_ERROR')); else resolve(result);
        });
      } catch (error) { reject(error); }
    });
  }
  function validEndpoint(value) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    if (!value.trim()) return '';
    try {
      const url = new URL(value.trim());
      const local = ['localhost','127.0.0.1'].includes(url.hostname);
      if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  function sanitizePatch(raw) {
    const clean = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clean;
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
      const value = raw[key];
      if (ENUMS[key]) { if (ENUMS[key].includes(value)) clean[key] = value; }
      else if (typeof DEFAULT_CONFIG[key] === 'boolean') { if (typeof value === 'boolean') clean[key] = value; }
      else if (key === 'ambientIntensity') {
        if (typeof value === 'number' && Number.isFinite(value)) clean[key] = Math.max(0, Math.min(100, Math.round(value)));
      } else if (key === 'contextWindowTokens') {
        if (value === 'auto' || [32000,128000,200000,400000,512000,1000000,2000000].includes(value)) clean[key] = value;
      } else if (key === 'thoughtEndpoint' && typeof value === 'string') {
        const endpoint = validEndpoint(value);
        if (endpoint || !value.trim()) clean[key] = endpoint;
      } else if (key === 'thoughtModel' && typeof value === 'string' && value.length <= 160 && !/[\r\n]/.test(value)) clean[key] = value.trim();
    }
    return clean;
  }
  function sanitizeConfig(raw) { return Object.assign({}, DEFAULT_CONFIG, sanitizePatch(raw)); }
  function detectHost(hostname) {
    const host = String(hostname === undefined ? (global.location && global.location.hostname || '') : hostname).toLowerCase();
    if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt';
    if (host === 'gemini.google.com') return 'gemini';
    return 'unknown';
  }
  function preferredScheme(cfg) {
    if (cfg.themeMode === 'dark' || cfg.themeMode === 'light') return cfg.themeMode;
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function resolvePalette(cfg) { return preferredScheme(cfg) === 'dark' ? cfg.palette : cfg.lightPreset; }
  function resolveScheme(cfg) {
    const preferred = preferredScheme(cfg);
    if (resolvePalette(cfg) !== 'host' || detectHost() === 'unknown' || !global.document) return preferred;
    // The native palette keeps host surfaces intact. Match our own small controls to it.
    for (const node of [global.document.documentElement, global.document.body]) {
      if (!node || !node.getAttribute) continue;
      const declared = node.getAttribute('data-theme') || node.getAttribute('theme');
      if (declared === 'dark' || declared === 'light') return declared;
      const classes = (node.getAttribute('class') || '').split(/\s+/);
      if (classes.some(name => ['dark','dark-theme','theme-dark'].includes(name))) return 'dark';
      if (classes.some(name => ['light','light-theme','theme-light'].includes(name))) return 'light';
    }
    if (global.getComputedStyle && global.document.documentElement) {
      const nativeScheme = global.getComputedStyle(global.document.documentElement).colorScheme;
      if (nativeScheme === 'dark' || nativeScheme === 'light') return nativeScheme;
    }
    return preferred;
  }
  const originals = new WeakMap();
  function applyConfigToRoot(input, rootElement) {
    const cfg = sanitizeConfig(input), root = rootElement || global.document && global.document.documentElement;
    if (!root) return false;
    const host = detectHost();
    const enabled = cfg.enabled && ((host === 'chatgpt' && cfg.enableChatGPT) || (host === 'gemini' && cfg.enableGemini) || host === 'unknown');
    if (!originals.has(root)) {
      const attrs = {};
      for (const attr of Array.from(root.attributes)) if (attr.name.startsWith('data-op-')) attrs[attr.name] = attr.value;
      originals.set(root, {attrs, alpha: root.style.getPropertyValue('--op-ambient-alpha'), priority: root.style.getPropertyPriority('--op-ambient-alpha'), hadStyle: root.getAttribute('style') !== null});
    }
    if (!enabled) {
      const original = originals.get(root);
      for (const attr of Array.from(root.attributes)) if (attr.name.startsWith('data-op-')) root.removeAttribute(attr.name);
      for (const [key,value] of Object.entries(original.attrs)) root.setAttribute(key,value);
      if (original.alpha) root.style.setProperty('--op-ambient-alpha', original.alpha, original.priority); else root.style.removeProperty('--op-ambient-alpha');
      // Review fix S2: no empty style="" residue on a root that had no style attribute.
      if (!original.hadStyle && root.getAttribute('style')?.trim() === '') root.removeAttribute('style');
      return false;
    }
    const scheme = resolveScheme(cfg);
    const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const attributes = {
      enabled:'true', host, scheme, 'effective-palette': resolvePalette(cfg),
      accent:cfg.accentTone, corners:cfg.cornerStyle, 'code-font':cfg.codeFont,
      ligatures:String(cfg.codeLigatures), motion: reduced ? 'off' : cfg.motionLevel,
      'sidebar-compact':String(cfg.sidebarCompact), composer:String(cfg.composerRestyle),
      'sticky-code':String(cfg.stickyCodeHeader), lang:cfg.language,
      'ambient-style':cfg.ambientStyle, texture:cfg.ambientTexture, 'motion-speed':cfg.motionSpeed,
      'composer-glow':String(cfg.composerGlow), 'sidebar-style':cfg.sidebarStyle,
      'content-width':cfg.contentWidth
    };
    for (const [key,value] of Object.entries(attributes)) if (root.getAttribute('data-op-'+key) !== value) root.setAttribute('data-op-'+key,value);
    const alpha = (cfg.ambientIntensity/100).toFixed(3);
    if (root.style.getPropertyValue('--op-ambient-alpha') !== alpha) root.style.setProperty('--op-ambient-alpha',alpha);
    return true;
  }
  async function loadConfig() {
    const api = getExtApi();
    const result = await callApi(api && api.storage && api.storage.local,'get',[STORAGE_KEY]);
    return sanitizeConfig(result && result[STORAGE_KEY]);
  }
  async function sendMessage(message) {
    const api = getExtApi();
    const result = await callApi(api && api.runtime,'sendMessage',message);
    if (!result || !result.ok) throw new Error(result && result.error || 'EXTENSION_REQUEST_FAILED');
    return result;
  }
  async function saveConfig(patch) { return (await sendMessage({type:'OP_CONFIG_PATCH',patch:sanitizePatch(patch)})).config; }
  async function saveContentWidth(contentWidth) { return (await sendMessage({type:'OP_CONTENT_WIDTH_SET',contentWidth})).config; }
  function subscribe(listener) {
    const api = getExtApi();
    if (!api || !api.storage || !api.storage.onChanged) return () => {};
    const handle = (changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) listener(sanitizeConfig(changes[STORAGE_KEY].newValue));
    };
    api.storage.onChanged.addListener(handle);
    return () => api.storage.onChanged.removeListener(handle);
  }
  function t(cfg, key) { const dict = I18N[cfg && cfg.language] || I18N['zh-CN']; return dict[key] || I18N['en-US'][key] || key; }
  function permissionRequest(endpoint) {
    const url = validEndpoint(endpoint);
    if (!url) throw new Error('INVALID_ENDPOINT');
    const parsed = new URL(url);
    // Extension match patterns are host/scheme scoped; ports are not supported.
    const value = {origins:[parsed.protocol+'//'+parsed.hostname+'/*']};
    const api = getExtApi();
    if (api && api.runtime && typeof api.runtime.getBrowserInfo === 'function') value.data_collection = DATA_PERMISSIONS.slice();
    return value;
  }
  global.ObsidianPrismSchema = Object.freeze({STORAGE_KEY,SECRETS_KEY,DATA_PERMISSIONS,DEFAULT_CONFIG,ENUMS,SCENE_PRESETS,I18N,getExtApi,callApi,validEndpoint,sanitizePatch,sanitizeConfig,detectHost,resolveScheme,resolvePalette,applyConfigToRoot,loadConfig,saveConfig,saveContentWidth,subscribe,t,sendMessage,permissionRequest});
})(globalThis);
