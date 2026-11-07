(() => {
  'use strict';

  if (window.self !== window.top) document.body.dataset.embedded = 'true';

  const charactersElement = document.getElementById('characters');
  const status = document.getElementById('status');
  const chatStatus = document.getElementById('chat-status');
  const chatTabs = document.getElementById('chat-tabs');
  const chatLog = document.getElementById('chat-log');
  const chatInput = document.getElementById('chat-input');
  const sendButton = document.getElementById('send-message');
  const clearMessageButton = document.getElementById('clear-message');
  const composerSpeakerAvatar = document.getElementById('composer-speaker-avatar');
  const composerSpeakerName = document.getElementById('composer-speaker-name');
  const closeRoomChatButton = document.getElementById('close-room-chat');
  const refreshScanButton = document.getElementById('refresh-scan');
  const openChatPaletteButton = document.getElementById('open-chat-palette');
  const speakerAvatar = document.getElementById('speaker-avatar');
  const characterChoice = document.getElementById('character-choice');
  const chatPalettePanel = document.getElementById('chat-palette-panel');
  const chatPaletteItems = document.getElementById('chat-palette-items');
  const chatPaletteStatus = document.getElementById('chat-palette-status');
  const refreshChatPaletteButton = document.getElementById('refresh-chat-palette');
  const closeChatPaletteButton = document.getElementById('close-chat-palette');
  const skillSuggestions = document.getElementById('skill-suggestions');
  const diceShortcuts = document.getElementById('dice-shortcuts');
  const aliasButtons = document.getElementById('alias-buttons');
  const aliasButtonsToggle = document.getElementById('alias-buttons-toggle');
  const aliasNameInput = document.getElementById('alias-name');
  const aliasTextInput = document.getElementById('alias-text');
  const aliasAddButton = document.getElementById('alias-add');
  const aliasCancelButton = document.getElementById('alias-cancel');
  const aliasList = document.getElementById('alias-list');
  const aliasStatus = document.getElementById('alias-status');
  const autoDeleteToggle = document.getElementById('auto-delete-toggle');
  const autoSkipInterval = document.getElementById('auto-skip-interval');
  const skipStatus = document.getElementById('skip-status');
  const settingsToggle = document.getElementById('toggle-settings');
  const setupSection = document.querySelector('.setup-section');
  const themeSelect = document.getElementById('theme-select');
  const fontSelect = document.getElementById('font-select');
  const fontSizeSelect = document.getElementById('font-size-select');
  const logSearchInput = document.getElementById('log-search');
  const logSearchCount = document.getElementById('log-search-count');
  const settingsExportButton = document.getElementById('settings-export');
  const settingsImportButton = document.getElementById('settings-import');
  const settingsIoJson = document.getElementById('settings-io-json');
  const THEME_STORAGE_KEY = 'ccfolia-theme-v1';
  const FONT_STORAGE_KEY = 'ccfolia-font-v1';
  const FONT_SIZE_STORAGE_KEY = 'ccfolia-font-size-v1';
  const CHARACTER_STORAGE_KEY = 'ccfolia-status-characters-v1';
  const PALETTE_STORAGE_KEY = 'ccfolia-chat-palette-v1';
  const ALIAS_STORAGE_KEY = 'ccfolia-alias-v1';
  const ALIAS_BUTTONS_VISIBLE_KEY = 'ccfolia-alias-buttons-visible-v1';
  settingsToggle?.addEventListener('click', () => {
    if (!setupSection) return;
    setupSection.open = !setupSection.open;
    settingsToggle.setAttribute('aria-expanded', String(setupSection.open));
  });
  const readStoredCharacters = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(CHARACTER_STORAGE_KEY) || 'null');
      return Array.isArray(stored) ? stored : null;
    } catch {
      return null;
    }
  };

  const readStoredTheme = () => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored === 'dark' || stored === 'original' ? stored : 'dark';
    } catch {
      return 'dark';
    }
  };

  const applyTheme = (theme) => {
    document.body.setAttribute('data-theme', theme);
    themeSelect.value = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  };
  themeSelect?.addEventListener('change', (event) => {
    applyTheme(event.target.value);
  });

  const fontStacks = {
    'NotoSansCJK-Regular': '"NotoSansCJK-Regular", "Noto Sans CJK JP", "Noto Sans JP", sans-serif',
    'JetBrainsMonoNF-Regular': '"JetBrainsMonoNF-Regular", "JetBrainsMono NF", "JetBrains Mono NF", monospace',
    'しねきゃぷしょん': '"しねきゃぷしょん", "cinecaption", "CineCaption", serif'
  };
  const supportedFonts = new Set(['default', ...Object.keys(fontStacks)]);
  const legacyFontFamilies = {
    noto: 'NotoSansCJK-Regular',
    'Noto Sans JP': 'NotoSansCJK-Regular',
    jetbrains: 'JetBrainsMonoNF-Regular',
    'JetBrains Mono NF': 'JetBrainsMonoNF-Regular',
    cinecaption: 'しねきゃぷしょん'
  };
  const readStoredFont = () => {
    try {
      const stored = localStorage.getItem(FONT_STORAGE_KEY);
      if (!stored) return 'default';
      const font = legacyFontFamilies[stored] ?? stored;
      return supportedFonts.has(font) ? font : 'default';
    } catch {
      return 'default';
    }
  };
  let selectedFontFamily = readStoredFont();
  const applyFont = (font) => {
    selectedFontFamily = supportedFonts.has(font) ? font : 'default';
    if (selectedFontFamily === 'default') {
      document.documentElement.style.removeProperty('--font-family-base');
    } else {
      document.documentElement.style.setProperty('--font-family-base', fontStacks[selectedFontFamily]);
    }
    fontSelect.value = selectedFontFamily;
    localStorage.setItem(FONT_STORAGE_KEY, selectedFontFamily);
  };
  fontSelect?.addEventListener('change', (event) => {
    applyFont(event.target.value);
  });
  applyFont(selectedFontFamily);
  const readStoredFontSize = () => {
    try {
      const size = Number(localStorage.getItem(FONT_SIZE_STORAGE_KEY));
      return Number.isInteger(size) && size >= 10 && size <= 24 ? size : 13;
    } catch {
      return 13;
    }
  };
  const applyFontSize = (size) => {
    const value = Math.min(24, Math.max(10, Math.round(Number(size) || 13)));
    document.documentElement.style.setProperty('--font-size-base', `${value}px`);
    fontSizeSelect.value = String(value);
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(value));
  };
  fontSizeSelect?.addEventListener('change', (event) => applyFontSize(event.target.value));

  let acquiredCharacters = readStoredCharacters();
  let latestChatState = null;
  // チャット全文の保存。一度でも「見えた or 届いた」メッセージをタブごとに蓄積します。
  // CCFOLIAのログ画面は表示分しかDOMに持たないため、過去に見た分もこの保存から遡って閲覧できます。
  const FULL_LOG_STORAGE_KEY = 'ccfolia-full-log-v1';
  const FULL_LOG_LIMIT_PER_TAB = 2000; // 1タブぶんに保管する上限。これを超えると古いものから抜きます。
  let fullLogSaveTimer = null;
  const readStoredFullLog = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(FULL_LOG_STORAGE_KEY) || 'null');
      if (!stored || typeof stored !== 'object') return new Map();
      return new Map(Object.entries(stored)
        .filter(([, list]) => Array.isArray(list))
        .map(([key, list]) => [key, list.filter((message) => message && typeof message === 'object')]));
    } catch {
      return new Map();
    }
  };
  const fullLogByTab = readStoredFullLog();
  // 連続保存を防ぐため、書き込みは多少遅延させます。失敗してもメモリ上は動き続けます。
  const saveFullLog = () => {
    clearTimeout(fullLogSaveTimer);
    fullLogSaveTimer = window.setTimeout(() => {
      try {
        const payload = {};
        for (const [key, list] of fullLogByTab) {
          payload[key] = list.length > FULL_LOG_LIMIT_PER_TAB ? list.slice(-FULL_LOG_LIMIT_PER_TAB) : list;
        }
        localStorage.setItem(FULL_LOG_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // 容量上限などで保存できなくても、セッション中はメモリだけで機能します。
      }
    }, 1500);
  };
  // 同じメッセージの判定キー。ログには同一内容の行が並ぶことがあるため、
  // 発言者・日付・本文の組み合わせで重複を見ます（見た目上の重複は1つに圧縮されます）。
  const messageKey = (message) => `${message?.speaker ?? ''}\u0000${message?.date ?? ''}\u0000${message?.text ?? ''}`;
  // 蓄積済みのログに、今回読めた行を順序を保ったまま取り込みます。
  // 読めるのは直近の行だけなので、まず「既存と一致する行」を境界として、
  // 境界より新しい未知の行は末尾に足し、境界より古い未知の行はさかのぼる位置に挿入します。
  const mergeLogMessages = (stored, incoming) => {
    const result = [...stored];
    if (!result.length) {
      const seen = new Set();
      for (const message of incoming ?? []) {
        if (!message) continue;
        const key = messageKey(message);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(message);
      }
      return result;
    }
    const positionByKey = new Map(result.map((message, index) => [messageKey(message), index]));
    let insertAfterKey = null; // nullのあいだは「末尾より後」を意味します（＝日付がこれより新しい行へ）
    for (let i = (incoming ?? []).length - 1; i >= 0; i -= 1) {
      const message = incoming[i];
      if (!message) continue;
      const key = messageKey(message);
      if (positionByKey.has(key)) {
        insertAfterKey = key;
        continue;
      }
      // 未知の行。直前に処理した行の前へ入れます。
      const base = insertAfterKey === null ? result.length : positionByKey.get(insertAfterKey);
      result.splice(base, 0, message);
      for (const [existingKey, index] of positionByKey) {
        if (index >= base) positionByKey.set(existingKey, index + 1);
      }
      positionByKey.set(key, base);
      insertAfterKey = key;
    }
    return result;
  };
  // タブを切り替えている最中は、CCFOLIA側の旧タブの行が一瞬届くことがあるため
  // 全文への取り込みを短いあいだ止めます（間違ったタブの行が混ざるのを防ぎます）。
  let tabMergeGuarded = false;
  let lastUnreadKey = '';
  // 選択中のチャットタブ（インデックスの文字列。null なら未取得）。
  // CCFOLIA側の状態（tab.selected）と、ボタンを押したときの即時反映の両方を拾います。
  let selectedTabIndex = null;
  // チャットパレットの取得結果を保存し、開くたびにCCFOLIA側を走査しなくて済むようにします。
  const readStoredPalette = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(PALETTE_STORAGE_KEY) || 'null');
      return Array.isArray(stored) ? stored.filter((entry) => typeof entry === 'string') : null;
    } catch {
      return null;
    }
  };
  // 発言者（キャラクター）ごとのパレット。「再取得」で全キャラぶん取得すると、
  // /g や技能パレット表示は現在の発言者に対応した技能だけを出します。
  const PALETTE_MAP_KEY = 'ccfolia-chat-palette-map-v1';
  const readPaletteMap = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(PALETTE_MAP_KEY) || 'null');
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
      const map = {};
      for (const [name, entries] of Object.entries(stored)) {
        if (Array.isArray(entries) && entries.every((entry) => typeof entry === 'string')) map[name] = entries;
      }
      return map;
    } catch {
      return {};
    }
  };
  let chatPaletteMap = readPaletteMap();
  const savePaletteMap = () => localStorage.setItem(PALETTE_MAP_KEY, JSON.stringify(chatPaletteMap));
  // 現在の発言者（キャラクター選択プルダウン）のキャラ名。
  const speakerCharacterName = () => characterChoice.selectedOptions[0]?.dataset.characterName ?? '';
  // 発言者用のパレット。キャラごとの保存がなければ、旧フラット配列へフォールバックします。
  // フォールバックは参照をメモ化します（毎回JSONを解析すると参照が変わり、無駄に再描画するため）。
  let legacyPaletteEntries = null;
  const paletteEntriesFor = (name) => {
    if (name && Array.isArray(chatPaletteMap[name])) return chatPaletteMap[name];
    if (!legacyPaletteEntries) legacyPaletteEntries = readStoredPalette() ?? [];
    return legacyPaletteEntries;
  };
  let chatPaletteEntries = paletteEntriesFor(speakerCharacterName());
  const savePaletteEntries = () => {
    // 旧キーにも書き込みます（キャラごとの保存がない・取得前の環境向けフォールバック）。
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(chatPaletteEntries));
  };
  // 表示・入力補助で使うパレットを、現在の発言者のぶんへ切り替えます。
  // 変わったときだけ技能パレットの描画を更新します。
  const syncPaletteEntries = () => {
    const entries = paletteEntriesFor(speakerCharacterName());
    if (chatPaletteEntries === entries) return;
    chatPaletteEntries = entries;
    renderChatPalette();
  };
  // シーン一覧も保存し、/s を選ぶたびにCCFOLIA側のシーンパネルを開かなくて済むようにします。
  const SCENE_STORAGE_KEY = 'ccfolia-scene-list-v1';
  const readStoredScenes = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(SCENE_STORAGE_KEY) || 'null');
      return Array.isArray(stored) ? stored.filter((entry) => typeof entry === 'string') : null;
    } catch {
      return null;
    }
  };
  let sceneEntries = readStoredScenes() ?? [];
  const saveSceneEntries = () => {
    localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(sceneEntries));
  };
  // いま選択されているシーン。/s を開いたときの初期ハイライトに使います。
  // 一覧の取得時にその場で判定できればそちらを優先し、/s で切り替えたときにも記憶します。
  const SCENE_CURRENT_KEY = 'ccfolia-current-scene-v1';
  const readStoredCurrentScene = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(SCENE_CURRENT_KEY) || 'null');
      return typeof stored === 'string' ? stored : '';
    } catch {
      return '';
    }
  };
  let currentSceneName = readStoredCurrentScene();
  const saveCurrentScene = () => {
    localStorage.setItem(SCENE_CURRENT_KEY, JSON.stringify(currentSceneName));
  };

  const syncCommandMap = () => {
    const commandMap = Object.fromEntries((acquiredCharacters ?? [])
      .filter((character) => Number.isInteger(Number(character.commandNumber)) && Number(character.commandNumber) >= 1 && Number(character.commandNumber) <= 9)
      .map((character) => [String(character.commandNumber), character.id]));
    chrome.runtime.sendMessage({ type: 'CCFOLIA_SAVE_COMMAND_MAP', commandMap }).catch((reason) => {
      console.error('[CCFOLIA ステータス変更] 番号設定を同期できませんでした。', reason);
    });
    // キャラクター一覧も保存（発言者対象のコマンドで名前からIDを解決するために使用する）。
    chrome.storage.local.set({ ccfoliaCharacters: acquiredCharacters ?? [] }).catch((reason) => {
      console.error('[CCFOLIA ステータス変更] キャラクター一覧を保存できませんでした。', reason);
    });
  };

  const renderCharacterChoices = () => {
    charactersElement.replaceChildren();
    const assignedNumbers = new Set((acquiredCharacters ?? [])
      .map((character) => Number(character.commandNumber))
      .filter((number) => Number.isInteger(number) && number >= 1 && number <= 9));

    for (const character of acquiredCharacters ?? []) {
      const row = document.createElement('div');
      row.className = 'character-row';
      const name = document.createElement('span');
      name.className = 'character-name';
      name.textContent = character.name;

      const numberSelect = document.createElement('select');
      numberSelect.className = 'character-number';
      numberSelect.dataset.characterId = character.id;
      numberSelect.setAttribute('aria-label', `${character.name}の番号`);
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '番号';
      numberSelect.append(empty);
      for (let number = 1; number <= 9; number += 1) {
        const option = document.createElement('option');
        option.value = String(number);
        option.textContent = String(number);
        option.disabled = assignedNumbers.has(number) && Number(character.commandNumber) !== number;
        numberSelect.append(option);
      }
      numberSelect.value = Number(character.commandNumber) >= 1 && Number(character.commandNumber) <= 9
        ? String(character.commandNumber)
        : '';
      row.append(name, numberSelect);
      charactersElement.append(row);
    }
  };

  const sendRequest = async (type, payload = {}) => {
    const result = await chrome.runtime.sendMessage({ type, ...payload });
    if (!result?.ok) throw new Error(result?.error || 'CCFOLIAへの操作に失敗しました。');
    return result;
  };

  // 長時間応答しない操作（CCFOLIA側の走査など）で処理が固まらないよう、打ち切りを付けます。
  // レース後に元の要求が解決・拒否されても、結果は無視します。
  const requestTimeout = (promise, seconds, label) => {
    promise.catch?.(() => {});
    return Promise.race([
      promise,
      new Promise((_, reject) => window.setTimeout(
        () => reject(new Error(`${label}が応答しません（${seconds}秒で打ち切りました）`)), seconds * 1000
      ))
    ]);
  };

  // CCFOLIA本体のUIを直接操作して情報を取得する間、拡張チャットのオーバーレイを一時的に隠します。
  // 取得対象のパネルやボタンがオーバーレイの下に埋まって操作できなくなることがあるためで、
  // モードは変えずに（iframeは生かしたまま）非表示にだけして、処理が終わったら元に戻します。
  const pauseChatOverlay = async () => {
    try {
      const result = await sendRequest('CCFOLIA_CHAT_OVERLAY_SUSPEND', { paused: true });
      return result?.expanded === true;
    } catch (reason) {
      console.error('[CCFOLIA ステータス変更]', '拡張チャットを一時的に隠せませんでした。', reason);
      return false;
    }
  };
  const resumeChatOverlay = async () => {
    try {
      await sendRequest('CCFOLIA_CHAT_OVERLAY_SUSPEND', { paused: false });
    } catch (reason) {
      console.error('[CCFOLIA ステータス変更]', '拡張チャットを元に戻せませんでした。', reason);
    }
  };

  // 選択中タブの赤い下線は、.chat-tabs の擬似要素を各タブの位置へスライドさせて描きます。
  // 下線をつらぬく静止の罫線は付けません（CSSは .chat-tabs::after を参照）。
  const updateChatTabIndicator = () => {
    const selected = chatTabs.querySelector('button.chat-tab.is-selected');
    if (!selected) {
      chatTabs.style.setProperty('--chat-tab-indicator-width', '0px');
      return;
    }
    chatTabs.style.setProperty('--chat-tab-indicator-left', `${selected.offsetLeft}px`);
    chatTabs.style.setProperty('--chat-tab-indicator-width', `${selected.offsetWidth}px`);
  };
  chatTabs.addEventListener('wheel', (event) => {
    if (event.deltaX !== 0 || event.deltaY === 0 || chatTabs.scrollWidth <= chatTabs.clientWidth) return;
    event.preventDefault();
    chatTabs.scrollLeft -= event.deltaY;
  }, { passive: false });
  chatTabs.addEventListener('scroll', updateChatTabIndicator, { passive: true });
  window.addEventListener('resize', updateChatTabIndicator);

  // チャットタブはCCFOLIA風のボタン列です。クリックで切り替えます。
  chatTabs.addEventListener('click', async (event) => {
    const button = event.target.closest('button.chat-tab');
    if (!button || button.disabled) return;
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index)) return;
    // 押した時点で選択表示を先に切り替え、CCFOLIA側の切替が確定してから状態を同期します。
    selectedTabIndex = String(index);
    for (const tab of chatTabs.querySelectorAll('button.chat-tab')) {
      tab.classList.toggle('is-selected', tab === button);
      tab.setAttribute('aria-selected', tab === button ? 'true' : 'false');
    }
    updateChatTabIndicator();
    // 切替の確定までの間、旧タブの行が一瞬届いても全文へ混ぜないようにします。
    tabMergeGuarded = true;
    try {
      await sendRequest('CCFOLIA_CHAT_SELECT_TAB', { index });
      await refreshChatState();
    } catch (reason) {
      chatStatus.textContent = reason.message;
    } finally {
      // 取り込みガードを少し遅れて解除します（CCFOLIA側の再描画が確定してから）。
      window.setTimeout(() => { tabMergeGuarded = false; }, 600);
    }
  });

  const AUTO_DELETE_MODE_KEY = 'ccfolia-auto-delete-mode-v1';
  const readStoredAutoDeleteMode = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(AUTO_DELETE_MODE_KEY) || 'null');
      return stored && typeof stored === 'object' ? stored : null;
    } catch {
      return null;
    }
  };
  const storedAutoDeleteMode = readStoredAutoDeleteMode();
  let autoDeleteEnabled = storedAutoDeleteMode?.enabled === true;
  const renderAutoDeleteToggle = (enabled) => {
    autoDeleteToggle.setAttribute('aria-pressed', String(enabled));
    autoDeleteToggle.textContent = enabled ? 'ON' : 'OFF';
  };
  renderAutoDeleteToggle(autoDeleteEnabled);

  const syncAutoSkipStatus = async () => {
    try {
      const state = await sendRequest('CCFOLIA_AUTO_SKIP_STATUS');
      skipStatus.textContent = state.status;
      autoDeleteToggle.disabled = false;
      autoDeleteEnabled = state.running === true;
      renderAutoDeleteToggle(autoDeleteEnabled);
      if (state.intervalSeconds && document.activeElement !== autoSkipInterval) {
        autoSkipInterval.value = String(state.intervalSeconds);
      }
    } catch (reason) {
      if (!autoDeleteEnabled) skipStatus.textContent = reason.message;
    }
  };

  const applyAutoDeleteMode = async () => {
    autoDeleteToggle.disabled = true;
    try {
      const seconds = Number(autoSkipInterval.value);
      const state = await sendRequest('CCFOLIA_AUTO_SKIP_MODE', {
        enabled: autoDeleteEnabled,
        intervalSeconds: Number.isFinite(seconds) ? seconds : 1
      });
      skipStatus.textContent = state.status;
      autoDeleteEnabled = state.running === true;
      renderAutoDeleteToggle(autoDeleteEnabled);
    } catch (reason) {
      skipStatus.textContent = reason.message;
    } finally {
      autoDeleteToggle.disabled = false;
    }
  };

  // ON/OFF スイッチ。開始・終了ではなく、モードを切り替えて制御ウィンドウに保存します。
  autoDeleteToggle.addEventListener('click', () => {
    autoDeleteEnabled = !autoDeleteEnabled;
    renderAutoDeleteToggle(autoDeleteEnabled);
    localStorage.setItem(AUTO_DELETE_MODE_KEY, JSON.stringify({
      enabled: autoDeleteEnabled,
      intervalSeconds: Number(autoSkipInterval.value)
    }));
    void applyAutoDeleteMode();
  });
  // 待ち時間の変更を反映します。
  autoSkipInterval.addEventListener('change', () => {
    const seconds = Number(autoSkipInterval.value);
    if (!Number.isFinite(seconds)) return;
    localStorage.setItem(AUTO_DELETE_MODE_KEY, JSON.stringify({
      enabled: autoDeleteEnabled,
      intervalSeconds: seconds
    }));
    if (autoDeleteEnabled) void applyAutoDeleteMode();
  });

  // CCBなどのロール結果（…ここから　 (1D100<=68) ＞ 57 ＞ 成功　ここまで…）と、
  // resb / sresb（抵抗判定・シークレット）の出力を色付けします。
  const ROLL_SUCCESS_COLOR = '#2089dc';
  const ROLL_FAILURE_COLOR = '#d1004a';
  // innerTextに紛れない zero-width 文字を除去します所在（あると正規表現が一致しません）。
  const stripInvisibleChars = (text) => (text ?? '').replace(/[\u200b\u200c\u200d\u2060]/g, '');
  // (1D100<=70) ＞ 20 ＞ 成功、resb / sresb（抵抗判定・シークレット）の出力を検出します。
  // 数値の表記揺れ（[20]、改行、20 / 100 など）を許容しつつ、技能名や会話文中の
  // 「成功」「決定的成功」「スペシャル」「失敗」には反応しません。
  const rollDiceFormulaPattern = /\(\s*\d+[Dd][\d+][^)\n]*\)/;
  const rollFormulaPattern = new RegExp(`${rollDiceFormulaPattern.source}|[sS]?[rR][eE][sS][bB]\\s*(?:\\([^)\\n]*\\)|\\d+)`);
  const rollKeywordPattern = /(決定的成功\s*[／/]\s*スペシャル|決定的成功|スペシャル|成功|失敗|ファンブル)/;
  const isSuccessKeyword = (keyword) => /^(?:成功|スペシャル|決定的成功|決定的成功\s*[／/]\s*スペシャル)$/.test(keyword);
  // ダイス式（カッコ始まり）かどうか。resb / sresb はカッコ始まりではないので区別できます。
  const isDiceFormulaMatch = (match) => match[0].startsWith('(');
  const rollResultColor = (segment) => {
    const formula = segment.match(rollFormulaPattern);
    if (!formula) return null;
    const regionStart = formula.index + formula[0].length;
    const region = segment.slice(regionStart, regionStart + 60);
    const separator = region.search(/[＞>]/);
    if (separator < 0) return null;
    const keyword = region.slice(separator + 1).match(rollKeywordPattern);
    if (!keyword) return null;
    return isSuccessKeyword(keyword[1]) ? ROLL_SUCCESS_COLOR : ROLL_FAILURE_COLOR;
  };
  const appendRollResultSpan = (container, text, color) => {
    const span = document.createElement('span');
    span.textContent = text;
    span.style.color = color;
    container.append(span);
  };
  // 「ここから…ここまで」に囲まれていない行でも、ダイス判定の出力部分を色付けします。
  const appendDiceResultText = (container, value) => {
    const formulaRegex = new RegExp(rollFormulaPattern.source, 'g');
    formulaRegex.lastIndex = 0;
    let cursor = 0;
    let formulaMatch;
    while ((formulaMatch = formulaRegex.exec(value)) !== null) {
      if (formulaMatch.index > cursor) container.append(value.slice(cursor, formulaMatch.index));
      const matchStart = formulaMatch.index;
      // resb / sresb の後に (N D M…) ＞ … の出力が続く場合は、そのダイス式を対象にします。
      const lookStart = matchStart + formulaMatch[0].length;
      const diceFormula = isDiceFormulaMatch(formulaMatch) ? null : value.slice(lookStart, lookStart + 120).match(rollDiceFormulaPattern);
      if (diceFormula) formulaMatch = { index: lookStart + diceFormula.index, 0: diceFormula[0] };
      const regionStart = formulaMatch.index + formulaMatch[0].length;
      const region = value.slice(regionStart, regionStart + 60);
      const separator = region.search(/[＞>]/);
      const keyword = separator < 0 ? null : region.slice(separator + 1).match(rollKeywordPattern);
      if (!keyword) {
        // 判定結果のないロール（ダメージ計算など）は通常色のまま出力します。
        container.append(formulaMatch[0]);
        cursor = formulaRegex.lastIndex;
        continue;
      }
      const end = regionStart + separator + 1 + keyword.index + keyword[1].length;
      // ダイス式（resb直後の出力を含む）から判定語までをまとめて1色で色付けします。
      // resb単独（後ろにダイス式の出力が続かない）では、コマンド部を通常色のまま判定語だけを色付けします。
      const start = isDiceFormulaMatch(formulaMatch) || diceFormula ? formulaMatch.index : regionStart + separator + 1 + keyword.index;
      if (start > matchStart) container.append(value.slice(matchStart, start));
      appendRollResultSpan(container, value.slice(start, end), isSuccessKeyword(keyword[1]) ? ROLL_SUCCESS_COLOR : ROLL_FAILURE_COLOR);
      cursor = end;
      formulaRegex.lastIndex = end;
    }
    if (cursor < value.length) container.append(value.slice(cursor));
  };
  const appendMessageText = (container, text) => {
    const value = stripInvisibleChars(text);
    if (!/(ここから|ここまで)/.test(value)) {
      appendDiceResultText(container, value);
      return;
    }
    // 「ここから」〜「ここまで」で囲まれた範囲全体を判定結果に応じて色付けします。
    const parts = value.split(/(ここから|ここまで)/);
    let buffer = '';
    let inSegment = false;
    const flushBuffer = (withinSegment) => {
      if (!buffer) return;
      // resb / sresb の出力は、コマンド部を色付けせず判定語だけを色付けするため、
      // 範囲全体を一色にせず個別の分割処理に任せます。
      const formula = withinSegment ? buffer.match(rollFormulaPattern) : null;
      if (formula && !isDiceFormulaMatch(formula)) {
        appendDiceResultText(container, buffer);
      } else {
        const color = withinSegment ? rollResultColor(buffer) : null;
        if (color) appendRollResultSpan(container, buffer, color);
        else container.append(buffer);
      }
      buffer = '';
    };
    for (const part of parts) {
      if (part === 'ここから') {
        flushBuffer(false);
        buffer = part;
        inSegment = true;
      } else if (part === 'ここまで') {
        buffer += part;
        flushBuffer(inSegment);
        inSegment = false;
      } else {
        buffer += part;
      }
    }
    flushBuffer(inSegment);
  };

  // ログ検索。発言者名・本文を部分一致で絞り込みます（スペース区切りの複数語のAND一致）。
  let logSearchQuery = '';
  const messageMatchesLogSearch = (message, query) => query.split(/\s+/).filter(Boolean)
    .every((word) => `${message.speaker ?? ''}\n${message.text ?? ''}`.toLocaleLowerCase().includes(word.toLocaleLowerCase()));

  const renderChatState = (chatState) => {
    latestChatState = chatState;
    const avatarBySpeaker = new Map();
    for (const message of chatState.messages ?? []) {
      if (message.speaker && message.avatar && !avatarBySpeaker.has(message.speaker)) {
        avatarBySpeaker.set(message.speaker, message.avatar);
      }
    }
    const avatarByCharacter = new Map((chatState.characters ?? [])
      .filter((character) => character.name && character.key)
      .map((character) => [character.name, character.key]));
    chatTabs.replaceChildren();
    let selectedTab = null;
    // 未着通知中のタブには赤い「●」（未読バッジ）を付けます（選び直すと解除されます）。
    const unreadByIndex = new Map((chatState.unreadTabs ?? []).map((item) => [item.index, item]));
    for (const tab of chatState.tabs ?? []) {
      const unread = unreadByIndex.has(tab.index);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chat-tab';
      button.dataset.index = String(tab.index);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', tab.selected ? 'true' : 'false');
      button.title = tab.name;
      const label = document.createElement('span');
      label.className = 'chat-tab-label';
      label.textContent = tab.name;
      button.append(label);
      if (unread) button.append(Object.assign(document.createElement('span'), { className: 'chat-tab-badge' }));
      button.classList.toggle('is-selected', Boolean(tab.selected));
      button.classList.toggle('has-unread', unread);
      chatTabs.append(button);
      if (tab.selected) selectedTab = String(tab.index);
    }
    if (selectedTab !== null) selectedTabIndex = selectedTab;
    updateChatTabIndicator();

    // 新しく検知された未着タブを、一度だけ状態表示に案内します（以降はタブの「●」が目印）。
    const unreadTabs = chatState.unreadTabs ?? [];
    const unreadKey = JSON.stringify(unreadTabs.map((item) => item.index));
    if (unreadTabs.length && unreadKey !== lastUnreadKey) {
      chatStatus.textContent = `未閲覧のタブに新着メッセージ: ${unreadTabs.map((item) => `「${item.name}」`).join('')}`;
    }
    lastUnreadKey = unreadKey;

    const previousScrollBottom = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 48;
    chatLog.replaceChildren();
    // 蓄積した全文を表示のかたちに取り込みます。遡って全部見られるようにするためです。
    // 初回（まだ蓄積がない状態）は「いま読めた行」を蓄積の起点にします。
    // 以降は、既存の続きとして届いた新しい行と、さかのぼって読めた古い行を順序を保って足します。
    const selectedTabEntry = (chatState.tabs ?? []).find((tab) => tab.selected) ?? null;
    const selectedTabKey = selectedTabEntry !== null && !tabMergeGuarded
      ? String(selectedTabEntry.index)
      : null;
    let logMessages = chatState.messages ?? [];
    if (selectedTabKey !== null) {
      const previousFull = fullLogByTab.get(selectedTabKey) ?? [];
      const merged = mergeLogMessages(previousFull, logMessages);
      if (merged.length !== previousFull.length) {
        fullLogByTab.set(
          selectedTabKey,
          merged.length > FULL_LOG_LIMIT_PER_TAB ? merged.slice(-FULL_LOG_LIMIT_PER_TAB) : merged
        );
        saveFullLog();
      }
      logMessages = merged;
    }
    // 検索語があるときはログ項目を絞り込み、ヒット数を検索窓の横に表示します。
    const searchWords = logSearchQuery.split(/\s+/).filter(Boolean);
    let shownMessageCount = 0;
    for (const message of logMessages) {
      if (searchWords.length && !messageMatchesLogSearch(message, logSearchQuery)) continue;
      shownMessageCount += 1;
      const item = document.createElement('li');
      item.className = 'chat-message';
      const avatarSources = [...new Set([
        message.avatar,
        avatarBySpeaker.get(message.speaker),
        avatarByCharacter.get(message.speaker)
      ].filter(Boolean))];
      if (avatarSources.length) {
        const avatar = document.createElement('img');
        avatar.className = 'message-avatar';
        let avatarSourceIndex = 0;
        avatar.src = avatarSources[avatarSourceIndex];
        avatar.alt = message.speaker ? `${message.speaker}のアイコン` : 'キャラクターアイコン';
        avatar.loading = 'lazy';
        avatar.addEventListener('error', () => {
          avatarSourceIndex += 1;
          if (avatarSources[avatarSourceIndex]) avatar.src = avatarSources[avatarSourceIndex];
          else avatar.remove();
        });
        item.append(avatar);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'message-avatar-placeholder';
        item.append(spacer);
      }
      const content = document.createElement('div');
      content.className = 'message-content';
      const header = document.createElement('div');
      header.className = 'message-header';
      const speaker = document.createElement('strong');
      speaker.textContent = message.speaker || '';
      const date = document.createElement('small');
      date.textContent = message.date || '';
      header.append(speaker, date);
      const text = document.createElement('p');
      appendMessageText(text, message.text ?? (typeof message === 'string' ? message : ''));
      content.append(header, text);
      item.append(content);
      chatLog.append(item);
    }
    if (previousScrollBottom) chatLog.scrollTop = chatLog.scrollHeight;
    if (logSearchCount) {
      const totalMessageCount = logMessages.length;
      logSearchCount.textContent = searchWords.length
        ? `${shownMessageCount}/${totalMessageCount}件`
        : '';
    }

    composerSpeakerAvatar.src = chatState.speakerAvatar ?? '';
    composerSpeakerAvatar.hidden = !chatState.speakerAvatar;
    composerSpeakerName.textContent = `入力中: ${chatState.speakerName || '（発言者なし）'}`;

    speakerAvatar.src = chatState.speakerAvatar ?? '';
    speakerAvatar.hidden = !chatState.speakerAvatar;
    const currentCharacter = characterChoice.value;
    // キャラクター選択プルダウン。選択肢はキャラクターのみで（選択なし・状態表記なし）。
    // CCFOLIA側の現在の発言者にプルダウンを追従させます。
    // 候補を1件も読めなかったときは、手元に残っている選択肢を壊さないでおきます。
    if ((chatState.characters ?? []).length) {
      characterChoice.replaceChildren();
      let matchedOption = null;
      for (const character of chatState.characters) {
        const name = character.name || `キャラクター${character.index + 1}`;
        const value = character.key || String(character.index);
        const option = new Option(name, value);
        option.dataset.state = character.state || '';
        option.dataset.characterName = character.name || '';
        option.dataset.characterKey = character.key || '';
        characterChoice.append(option);
        if (character.name && character.name === chatState.speakerName) matchedOption = option;
      }
      if (matchedOption) {
        characterChoice.value = matchedOption.value;
      } else if ([...characterChoice.options].some((option) => option.value === currentCharacter)) {
        characterChoice.value = currentCharacter;
      }
    }
    // CCFOLIA側の発言者が変わったら、表示中のパレットもそのキャラのぶんへ切り替えます。
    syncPaletteEntries();

  };

  // ダイスショートカット。同じボタンを連続クリックした回数で個数を決めます。
  // 1回目で 1d6 を挿入し、続けて押すと挿入済みの式を 2d6、3d6 …へ差し替えます。
  // 別の面数のボタンを押すと、カーソルの直前がダイス式なら「+」で連結して合成します
  // （例: d2 → d4 で 1d2+1d4）。
  const diceLastInsert = new Map();
  // 記憶した位置に式がまだ残っているか確認します。入力内容が手直しされていたら忘れます。
  const storedFormulaAt = (storedSides, entry) => Boolean(entry)
    && entry.end <= chatInput.value.length
    && chatInput.value.slice(entry.start, entry.end) === `${entry.count}d${storedSides}`;
  const pruneDiceLastInsert = () => {
    for (const [storedSides, entry] of diceLastInsert) {
      if (!storedFormulaAt(storedSides, entry)) diceLastInsert.delete(storedSides);
    }
  };
  // 式の挿し替えでテキスト長が変わったとき、後ろの記憶位置をずらして合わせます。
  const shiftDiceEntries = (from, delta) => {
    for (const entry of diceLastInsert.values()) {
      if (entry.start >= from) {
        entry.start += delta;
        entry.end += delta;
      }
    }
  };
  const commitDiceInput = (caretIndex) => {
    chatInput.focus();
    chatInput.selectionStart = chatInput.selectionEnd = caretIndex;
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    pruneDiceLastInsert();
  };
  const insertDiceFormula = (sides) => {
    const previous = diceLastInsert.get(sides);
    if (storedFormulaAt(sides, previous)) {
      // 同じボタンを続けて押したときは、挿入済みの式の個数を増やして差し替えます。
      const count = previous.count + 1;
      const formula = `${count}d${sides}`;
      shiftDiceEntries(previous.end, formula.length - (previous.end - previous.start));
      chatInput.setRangeText(formula, previous.start, previous.end, 'end');
      diceLastInsert.set(sides, { start: previous.start, end: previous.start + formula.length, count });
      commitDiceInput(previous.start + formula.length);
      return;
    }
    // 新しく挿入します。カーソルの直前が「ダイス式（+ダイス式…）」の連結なら、
    // 連結の中に同じ面数の項を探して個数を増やします（例: 1d2 の後ろで d2 → 2d2）。
    // なければ連結の末尾に「+」を付けて合成します（例: d2 → d4 で 1d2+1d4）。
    let at = chatInput.selectionStart ?? chatInput.value.length;
    let end = chatInput.selectionEnd ?? at;
    const chain = (chatInput.value.slice(0, at).match(/\d+d\d+(?:\+\d+d\d+)*$/) ?? [])[0];
    if (chain) {
      const chainStart = at - chain.length;
      let chainEnd = at;
      for (;;) {
        const match = chatInput.value.slice(chainEnd).match(/^\+\d+d\d+/);
        if (!match) break;
        chainEnd += match[0].length;
      }
      // 連結の中の同じ面数の項（最後尾のもの）を探します。
      const termPattern = new RegExp(`(\\d+)d${sides}(?!\\d)`, 'g');
      termPattern.lastIndex = chainStart;
      let term = null;
      let termMatch;
      while ((termMatch = termPattern.exec(chatInput.value)) !== null) {
        if (termMatch.index >= chainEnd) break;
        term = termMatch;
      }
      if (term) {
        const count = Number(term[1]) + 1;
        const formula = `${count}d${sides}`;
        shiftDiceEntries(term.index + term[0].length, formula.length - term[0].length);
        chatInput.setRangeText(formula, term.index, term.index + term[0].length, 'end');
        diceLastInsert.set(sides, { start: term.index, end: term.index + formula.length, count });
        commitDiceInput(term.index + formula.length);
        return;
      }
      at = chainEnd;
      end = at;
      const chainInsertText = `+1d${sides}`;
      chatInput.setRangeText(chainInsertText, at, end, 'end');
      shiftDiceEntries(end, chainInsertText.length);
      diceLastInsert.set(sides, { start: at + 1, end: at + chainInsertText.length, count: 1 });
      commitDiceInput(at + chainInsertText.length);
      return;
    }
    // ダイス式の直後でないときは、カーソル位置（選択範囲）へそのまま挿入します。
    const plainInsertText = `1d${sides}`;
    chatInput.setRangeText(plainInsertText, at, end, 'end');
    shiftDiceEntries(end, plainInsertText.length - (end - at));
    diceLastInsert.set(sides, { start: at, end: at + plainInsertText.length, count: 1 });
    commitDiceInput(at + plainInsertText.length);
  };

  const renderDiceControls = () => {
    diceShortcuts.replaceChildren();
    for (const sides of [2, 3, 4, 6, 8, 10, 12, 20, 100]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `d${sides}`;
      button.setAttribute('aria-label', `d${sides}を入力（連続クリックで個数を指定）`);
      button.addEventListener('click', () => insertDiceFormula(sides));
      diceShortcuts.append(button);
    }
    const sanButton = document.createElement('button');
    sanButton.type = 'button';
    sanButton.textContent = 'SAN';
    sanButton.setAttribute('aria-label', '正気度ロールを入力');
    sanButton.addEventListener('click', () => insertChatInputText('1d100<={SAN} 【正気度ロール】'));
    diceShortcuts.append(sanButton);
  };

  const insertChatInputText = (text) => {
    const start = chatInput.selectionStart ?? chatInput.value.length;
    const end = chatInput.selectionEnd ?? start;
    chatInput.setRangeText(text, start, end, 'end');
    chatInput.focus();
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // --- エイリアス ---
  // 設定画面で登録した内容をメッセージ入力欄へ入れるボタン列です。
  let aliasEntries = (() => {
    try {
      const stored = JSON.parse(localStorage.getItem(ALIAS_STORAGE_KEY) || 'null');
      return Array.isArray(stored)
        ? stored.filter((entry) => entry && typeof entry.name === 'string' && typeof entry.text === 'string')
        : [];
    } catch {
      return [];
    }
  })();
  // 各aliasのボタン列への表示は個別に切り替えられます。古い保存データ（buttonVisibleなし）は表示扱いです。
  const isAliasButtonVisible = (entry) => entry?.buttonVisible !== false;
  let aliasEditingIndex = -1;
  const saveAliasEntries = () => {
    localStorage.setItem(ALIAS_STORAGE_KEY, JSON.stringify(aliasEntries));
  };
  const renderAliasButtons = () => {
    aliasButtons.replaceChildren();
    // 順序はalias一覧の並び（設定で↑↓入替）に従い、非表示に設定したaliasのボタンは出しません。
    for (const [index, entry] of aliasEntries.entries()) {
      if (!isAliasButtonVisible(entry)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.name;
      button.setAttribute('aria-label', `エイリアス「${entry.name}」を入力欄に入力`);
      button.addEventListener('click', () => runAliasEntry(index));
      aliasButtons.append(button);
    }
  };
  // aliasボタン列は既定で非表示。設定の「ボタン列：表示／非表示」で切り替えます（設定は保存されます）。
  let aliasButtonsVisible = (() => {
    try {
      return JSON.parse(localStorage.getItem(ALIAS_BUTTONS_VISIBLE_KEY) || 'false') === true;
    } catch {
      return false;
    }
  })();
  const applyAliasButtonsVisibility = () => {
    aliasButtonsToggle.textContent = aliasButtonsVisible ? 'ボタン列：表示' : 'ボタン列：非表示';
    aliasButtonsToggle.setAttribute('aria-pressed', String(aliasButtonsVisible));
    aliasButtons.hidden = !aliasButtonsVisible;
  };
  aliasButtonsToggle.addEventListener('click', () => {
    aliasButtonsVisible = !aliasButtonsVisible;
    localStorage.setItem(ALIAS_BUTTONS_VISIBLE_KEY, JSON.stringify(aliasButtonsVisible));
    applyAliasButtonsVisibility();
  });
  const runAliasEntry = (index) => {
    const entry = aliasEntries[index];
    if (!entry) return;
    chatInput.value = entry.text;
    hideCommandSuggestions();
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    chatInput.focus();
  };
  const renderAliasEditor = () => {
    if (aliasEditingIndex >= 0 && !aliasEntries[aliasEditingIndex]) aliasEditingIndex = -1;
    aliasList.replaceChildren();
    aliasAddButton.textContent = aliasEditingIndex >= 0 ? '更新' : '追加';
    aliasCancelButton.hidden = aliasEditingIndex < 0;
    for (const [index, entry] of aliasEntries.entries()) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.name;
      button.title = entry.text;
      button.setAttribute('aria-label', `エイリアス「${entry.name}」を編集`);
      button.addEventListener('click', () => {
        aliasEditingIndex = index;
        aliasNameInput.value = entry.name;
        aliasTextInput.value = entry.text;
        renderAliasEditor();
      });
      row.append(button);
      const preview = document.createElement('span');
      preview.textContent = '（' + entry.text.replace(/\s+/g, ' ').trim().slice(0, 40) + '）';
      row.append(preview);
      // このaliasのボタン列表示の切り替え。
      const visibilityButton = document.createElement('button');
      visibilityButton.type = 'button';
      visibilityButton.className = 'alias-visibility';
      visibilityButton.textContent = isAliasButtonVisible(entry) ? 'ボタン：表示' : 'ボタン：非表示';
      visibilityButton.setAttribute('aria-pressed', String(isAliasButtonVisible(entry)));
      visibilityButton.title = 'ボタン列に表示するか、このaliasだけ隠すかを切り替えます';
      visibilityButton.setAttribute('aria-label', `エイリアス「${entry.name}」のボタン列表示を切り替え`);
      visibilityButton.addEventListener('click', () => {
        entry.buttonVisible = !isAliasButtonVisible(entry);
        saveAliasEntries();
        renderAliasEditor();
        renderAliasButtons();
        applyAliasButtonsVisibility();
      });
      row.append(visibilityButton);
      // 順番の入替（上／下へ移動）。
      const upButton = document.createElement('button');
      upButton.type = 'button';
      upButton.className = 'alias-reorder';
      upButton.textContent = '↑';
      upButton.title = 'このaliasを上へ移動します';
      upButton.setAttribute('aria-label', `エイリアス「${entry.name}」を上へ移動`);
      upButton.disabled = index === 0;
      upButton.addEventListener('click', () => {
        if (index === 0) return;
        [aliasEntries[index - 1], aliasEntries[index]] = [aliasEntries[index], aliasEntries[index - 1]];
        if (aliasEditingIndex === index) aliasEditingIndex = index - 1;
        else if (aliasEditingIndex === index - 1) aliasEditingIndex = index;
        saveAliasEntries();
        renderAliasEditor();
        renderAliasButtons();
      });
      row.append(upButton);
      const downButton = document.createElement('button');
      downButton.type = 'button';
      downButton.className = 'alias-reorder';
      downButton.textContent = '↓';
      downButton.title = 'このaliasを下へ移動します';
      downButton.setAttribute('aria-label', `エイリアス「${entry.name}」を下へ移動`);
      downButton.disabled = index >= aliasEntries.length - 1;
      downButton.addEventListener('click', () => {
        if (index >= aliasEntries.length - 1) return;
        [aliasEntries[index + 1], aliasEntries[index]] = [aliasEntries[index], aliasEntries[index + 1]];
        if (aliasEditingIndex === index) aliasEditingIndex = index + 1;
        else if (aliasEditingIndex === index + 1) aliasEditingIndex = index;
        saveAliasEntries();
        renderAliasEditor();
        renderAliasButtons();
      });
      row.append(downButton);
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'alias-delete';
      deleteButton.textContent = '削除';
      deleteButton.setAttribute('aria-label', `エイリアス「${entry.name}」を削除`);
      deleteButton.addEventListener('click', () => {
        aliasEntries.splice(index, 1);
        saveAliasEntries();
        if (aliasEditingIndex === index) resetAliasEditor();
        renderAliasEditor();
        renderAliasButtons();
      });
      row.append(deleteButton);
      aliasList.append(row);
    }
  };
  const resetAliasEditor = () => {
    aliasEditingIndex = -1;
    aliasNameInput.value = '';
    aliasTextInput.value = '';
  };
  aliasAddButton.addEventListener('click', () => {
    const name = aliasNameInput.value.trim();
    const text = aliasTextInput.value.replace(/\r?\n/g, '\n');
    if (!name) {
      aliasStatus.textContent = 'alias名を入力してください。';
      return;
    }
    if (!text.trim()) {
      aliasStatus.textContent = 'aliasの内容を入力してください。';
      return;
    }
    const existingIndex = aliasEntries.findIndex((entry) => entry.name === name);
    // 編集・同名上書きのときは既存の表示設定を引き継ぎ、追加のときは表示ONで登録します。
    const buttonVisible = (aliasEditingIndex >= 0 && aliasEntries[aliasEditingIndex]
      ? isAliasButtonVisible(aliasEntries[aliasEditingIndex])
      : existingIndex >= 0 ? isAliasButtonVisible(aliasEntries[existingIndex]) : true);
    if (aliasEditingIndex >= 0 && aliasEntries[aliasEditingIndex]) {
      aliasEntries[aliasEditingIndex] = { name, text, buttonVisible };
      resetAliasEditor();
    } else if (existingIndex >= 0) {
      // 同名のaliasがあるときは上書きします。
      aliasEntries[existingIndex] = { name, text, buttonVisible };
    } else {
      aliasEntries.push({ name, text, buttonVisible: true });
    }
    saveAliasEntries();
    aliasStatus.textContent = `alias「${name}」を登録しました。`;
    renderAliasEditor();
    resetAliasEditor();
    renderAliasButtons();
  });
  aliasCancelButton.addEventListener('click', () => {
    resetAliasEditor();
    renderAliasEditor();
  });


  // ステータスコマンド形式（1s-10, 2h20 など）か簡易判定し、候補表示を抑制する。
  const isStatusCommandText = (text) => /^(?:\d+(?:(?:\s*,\s*|\s+)\d+)*)?\s*(hp|mp|san|h|m|s)(\s*)(=|[+-])?(\s*)(\d+)$/i.test(text.trim());

  let suggestionHighlightIndex = -1;

  const hideSkillSuggestions = () => {
    if (!skillSuggestions) return;
    skillSuggestions.hidden = true;
    skillSuggestions.replaceChildren();
    suggestionHighlightIndex = -1;
  };

  const showSkillSuggestions = (query) => {
    if (!skillSuggestions) return;
    const q = query.replace(/\s+/g, ' ').trim();
    if (!q || isStatusCommandText(q)) {
      hideSkillSuggestions();
      return;
    }
    // メッセージ入力中の技能候補には、ダメージ判定の式は出しません（/g コマンドからは選べます）。
    const filtered = chatPaletteEntries.filter((entry) =>
      !entry.includes('ダメージ判定')
      && entry.toLocaleLowerCase().includes(q.toLocaleLowerCase())
    ).slice(0, 10);

    if (filtered.length === 0) {
      hideSkillSuggestions();
      return;
    }

    skillSuggestions.replaceChildren();
    for (const entry of filtered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'skill-suggestion-item';
      button.textContent = entry;
      button.addEventListener('click', () => {
        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        insertChatInputText(entry);
        hideSkillSuggestions();
        chatInput.focus();
      });
      skillSuggestions.append(button);
    }
    skillSuggestions.hidden = false;
    suggestionHighlightIndex = -1;
  };

  /* /m /g /c /s /a コマンド。fzf風のTab補完で選択します。
     /m = チャットタブ移動 /g = 技能選択（チャットパレット） /c = キャラ選択 /s = シーン選択 /a = aliasを入力欄に挿入 */
  const commandSuggestions = document.getElementById('command-suggestions');
  let commandMode = null; // 'm' | 'g' | 'c' | 's' | 'a'
  let commandMatches = [];
  let commandIndex = 0;
  let commandQuery = null;
  // 「/m」「/g」「/c」「/s」「/a」の入力をコマンドとして扱います（半角スペースは任意）。
  // ただし、本家の「/scene シーン名」コマンドを手入力したときはセレクタに奪わず、そのまま送信させます。
  const parseCommandInput = (value) => {
    const match = value.match(/^\/([amgcs])(.*)$/);
    if (!match) return null;
    if (match[1] === 's' && value.toLowerCase().startsWith('/scene')) return null;
    return { mode: match[1], query: match[2].replace(/^\s+/, '') };
  };

  const commandCandidates = (mode) => {
    if (mode === 'm') {
      return (latestChatState?.tabs ?? []).map((tab) => ({ label: tab.name, tab }));
    }
    if (mode === 'g') {
      return chatPaletteEntries.map((entry) => ({ label: entry, value: entry }));
    }
    if (mode === 's') {
      // シーンの切替は、実質的に本家の「/scene シーン名」チャットコマンドを送るのと同じです。
      return sceneEntries.map((entry) => ({ label: entry, value: `/scene ${entry}` }));
    }
    if (mode === 'a') {
      // aliasは名前で選択すると内容を入力欄へ入れます。
      return aliasEntries.map((entry, index) => ({ label: entry.name, title: entry.name + '：' + entry.text.replace(/\n/g, ' / '), aliasIndex: index }));
    }
    return (latestChatState?.characters ?? [])
      .map((character) => ({
        label: character.name || `キャラクター${character.index + 1}`,
        name: character.name,
        key: character.key
      }))
      // 現在の送行者（発言名欄のキャラクター）を常に先頭に並べます。
      .sort((left, right) => {
        const speakerName = latestChatState?.speakerName ?? '';
        const isSpeaker = (candidate) => Boolean(speakerName && candidate.name === speakerName);
        return Number(isSpeaker(right)) - Number(isSpeaker(left));
      });
  };

  const commandEmptyMessage = (mode) => {
    if (mode === 'm') return '一致するチャットタブがありません。';
    if (mode === 'g') return '一致する技能がありません。「一括取得」やパレットの「再取得」で取得してください。';
    if (mode === 's') return 'シーン候補がありません。入力欄が空の状態から取得するか、「一括取得」で取得してください。';
    if (mode === 'a') return 'aliasがありません。「設定・キャラクター情報」でaliasを登録してください。';
    return 'キャラクター候補がありません。「再取得」で候補を取得してください。';
  };

  const hideCommandSuggestions = () => {
    hideSkillSuggestions(); // ensure separate dropdowns do not stay visible
    if (!commandSuggestions) return;
    commandSuggestions.hidden = true;
    commandSuggestions.replaceChildren();
    commandMatches = [];
    commandIndex = 0;
    commandQuery = null;
    commandMode = null;
  };

  // 表示した場合はtrue、コマンド以外の入力ならfalseを返します（技能候補との居住分け用）。
  const matchesCommandQuery = (label, query) => query.split(/\s+/).filter(Boolean)
    .every((word) => label.toLocaleLowerCase().includes(word.toLocaleLowerCase()));
  const renderCommandSuggestions = () => {
    if (!commandSuggestions) return false;
    const parsed = parseCommandInput(chatInput.value);
    if (!parsed) {
      hideCommandSuggestions();
      return false;
    }
    // モード・絞り込み語が変わったらハイライトを初期位置へ戻します。
    // シーン(/s)は初期位置を「現在のシーン」に合わせ、それ以外は先頭に当てます。
    let resetHighlight = parsed.mode !== commandMode || parsed.query !== commandQuery;
    commandMode = parsed.mode;
    commandQuery = parsed.query;
    // 絞り込みはスペース区切りの複数語のAND一致（fzf風）です。
    const candidates = commandCandidates(commandMode);
    const filtered = candidates.filter((candidate) => matchesCommandQuery(candidate.label, parsed.query));
    if (commandIndex >= filtered.length || commandIndex < 0) resetHighlight = true;
    commandMatches = filtered;
    commandSuggestions.replaceChildren();
    if (!commandMatches.length) {
      const empty = document.createElement('span');
      empty.className = 'suggestion-empty';
      empty.textContent = commandEmptyMessage(commandMode);
      commandSuggestions.append(empty);
      commandIndex = -1;
    } else {
      if (resetHighlight) {
        commandIndex = 0;
        // 絞り込み語が空のときだけ「現在位置」から始めます（言葉を入れるとリストが変わるため先頭）。
        if (!commandQuery) {
          // チャットタブ(/m)は現在選択中のタブの位置に、最初からハイライトを当てます。
          if (commandMode === 'm') {
            let index = commandMatches.findIndex((candidate) => candidate.tab?.selected === true);
            if (index < 0) {
              index = commandMatches.findIndex((candidate) => String(candidate.tab?.index ?? '') === String(selectedTabIndex));
            }
            if (index >= 0) commandIndex = index;
          }
          // シーン(/s)は現在選択されているシーンの位置に、最初からハイライトを当てます。
          if (commandMode === 's') {
            const index = commandMatches.findIndex((candidate) => candidate.label === currentSceneName);
            if (index >= 0) commandIndex = index;
          }
        }
      } else if (commandIndex >= commandMatches.length) {
        commandIndex = 0;
      }
      commandMatches.forEach((candidate, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'skill-suggestion-item';
        button.classList.toggle('is-highlighted', index === commandIndex);
        button.textContent = candidate.label;
        button.title = candidate.title ?? candidate.label;
        button.addEventListener('click', () => {
          commandIndex = index;
          void executeCommand();
        });
        commandSuggestions.append(button);
      });
    }
    commandSuggestions.hidden = false;
    // 選択中の行が候補の多いリスト内の画面外にあると、Tabや上下キーで移動しても
    // 何を選んでいるのか分からなくなるため、ハイライトを見える位置へ送ります。
    const highlighted = commandSuggestions.querySelector('.skill-suggestion-item.is-highlighted');
    if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
    // 技能候補はコマンド入力中は表示しません。
    hideSkillSuggestions();
    return true;
  };

  // Tab押下。fzfのように選択を順送りします。
  // 入力欄の内容は書き換えません（検索語を壊さないため）。候補の反映はEnterで行います。
  const moveCommandSelection = (direction = 1) => {
    const count = commandMatches.length;
    if (!count) return;
    if (commandIndex < 0) commandIndex = 0;
    else commandIndex = ((commandIndex + direction) % count + count) % count;
    renderCommandSuggestions();
  };

  const executeCommand = async () => {
    const count = commandMatches.length;
    // シーンは初回に候補が無くても、その場でCCFOLIA側のシーンパネルを開いて取得してから
    // 候補を表示します（自動実行はしないので、候補が見えたらもう一度Enterします）。
    if (commandMode === 's' && !sceneEntries.length) {
      try {
        await ensureSceneEntries();
        // 取得できた一覧にあるなら、現在のシーンの位置からハイライトを始めます。
        const index = commandCandidates('s').findIndex((candidate) => candidate.label === currentSceneName);
        commandIndex = Math.max(0, index);
        renderCommandSuggestions();
      } catch (reason) {
        chatStatus.textContent = reason.message;
      }
      return;
    }
    if (!count || commandIndex < 0 || commandIndex >= count) {
      chatStatus.textContent = commandEmptyMessage(commandMode ?? 'm');
      chatInput.value = '';
      hideCommandSuggestions();
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const selected = commandMatches[commandIndex];
    if (commandMode === 'a') {
      // aliasは内容を入力欄へ入れるだけで、送信しません。
      hideCommandSuggestions();
      runAliasEntry(selected.aliasIndex);
      return;
    }
    if (commandMode === 'g') {
      // 技能を選択したら、そのテキストを入力欄に置きます（送信はしません）。
      chatInput.value = selected.value;
      hideCommandSuggestions();
      chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      chatInput.focus();
      return;
    }
    if (commandMode === 's') {
      // シーン選択。本家の「/scene シーン名」コマンドを送るのと同じです。
      const commandText = `/scene ${selected.label}`;
      // 決定したらすぐにメッセージ欄を空にします（送信に失敗した場合のみ元に戻します）。
      chatInput.value = '';
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      try {
        await sendRequest('CCFOLIA_CHAT_SEND', { text: commandText });
        // 次に /s を開いたときの初期ハイライト用に、選択したシーンを記憶します。
        currentSceneName = selected.label;
        saveCurrentScene();
        chatStatus.textContent = `シーンを「${selected.label}」に切り替えました。`;
      } catch (reason) {
        chatStatus.textContent = reason.message;
        chatInput.value = commandText;
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      chatInput.focus();
      return;
    }
    try {
      if (commandMode === 'm') {
        await sendRequest('CCFOLIA_CHAT_SELECT_TAB', { index: selected.tab.index });
        chatStatus.textContent = `チャットタブを「${selected.label}」に切り替えました。`;
      } else {
        await sendRequest('CCFOLIA_CHAT_SELECT_CHARACTER', { name: selected.name, key: selected.key });
        chatStatus.textContent = `キャラクターを「${selected.label}」に切り替えました。`;
      }
      chatInput.value = '';
      hideCommandSuggestions();
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      await refreshChatState({ force: true, includeCharacters: commandMode === 'c' });
    } catch (reason) {
      chatStatus.textContent = reason.message;
    }
  };

  const renderChatPalette = () => {
    chatPaletteItems.replaceChildren();
    for (const entry of chatPaletteEntries) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry;
      button.title = entry;
      button.addEventListener('click', () => {
        insertChatInputText(entry);
        chatPalettePanel.hidden = true;
      });
      item.append(button);
      chatPaletteItems.append(item);
    }
    chatPaletteStatus.textContent = chatPaletteEntries.length
      ? (() => {
        const name = speakerCharacterName();
        const target = name && Array.isArray(chatPaletteMap[name]) ? name : null;
        return `${target ? `${target}：` : ''}${chatPaletteEntries.length}件`;
      })()
      : 'パレットの項目がありません。';
  };

  const refreshChatState = async ({ force = true, includeCharacters = false } = {}) => {
    try {
      const chatState = await sendRequest('CCFOLIA_CHAT_GET_STATE', { force, includeCharacters });
      renderChatState(chatState);
    } catch (reason) {
      if (!latestChatState) chatStatus.textContent = reason instanceof Error ? reason.message : String(reason);
    }
  };

  closeRoomChatButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeRoomChatButton.disabled = true;
    try {
      await sendRequest('CCFOLIA_CHAT_CLOSE_DRAWER');
      chatStatus.textContent = 'ルームチャットを閉じました。';
    } catch (reason) {
      chatStatus.textContent = reason.message;
    } finally {
      closeRoomChatButton.disabled = false;
    }
  });

  const storeAcquiredCharacters = (characters) => {
    const previousCharacters = acquiredCharacters ?? [];
    acquiredCharacters = characters.map((character) => {
      const previous = previousCharacters.find((item) => item.id === character.id)
        ?? previousCharacters.find((item) => item.name === character.name);
      const number = Number(previous?.commandNumber);
      return Number.isInteger(number) && number >= 1 && number <= 9
        ? { ...character, commandNumber: number }
        : character;
    });
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(acquiredCharacters));
    syncCommandMap();
    renderCharacterChoices();
  };

  // 巡回方式（CCFOLIA_CHAT_PALETTE_SCAN_ALL）に失敗したときのフォールバック:
  // 名前を指定してキャラを切り替えながら、人ごとにパレットを読み込みます。
  const acquirePalettesPerName = async () => {
    let names = acquiredCharacters.map((character) => character.name).filter(Boolean);
    // HP行からキャラ情報を取れていないときは、チャット側のキャラクター選択メニューの
    // 候補から名前を採って、人数ぶんの取得を続行します。
    if (!names.length) {
      chatStatus.textContent = 'キャラクター選択メニューから候補を取得しています…';
      await refreshChatState({ force: true, includeCharacters: true });
      names = (latestChatState?.characters ?? []).map((item) => item.name).filter(Boolean);
      if (names.length) {
        chatPaletteStatus.textContent = `キャラ情報が未取得のため、選択メニューの${names.length}件から読み込みます。`;
      }
    }
    const items = {};
    let failed = 0;
    for (const [loopIndex, name] of names.entries()) {
      chatStatus.textContent = `パレットを取得しています…（${loopIndex + 1}/${names.length}人目: 「${name}」）`;
      try {
        // 各工程に打ち切りを付け、CCFOLIA側が応答しなくても全体が固まらないようにします。
        await requestTimeout(sendRequest('CCFOLIA_CHAT_SELECT_CHARACTER', { name, key: '' }), 30, `キャラクター「${name}」への切替`);
        const palette = await requestTimeout(sendRequest('CCFOLIA_CHAT_PALETTE'), 180, `「${name}」のチャットパレット取得`);
        if (palette?.characterName && Array.isArray(palette?.entries)) {
          console.info('[CCFOLIA ステータス変更]', `パレット（${palette.characterName}）を${palette.entries.length}件保存します。`);
          items[palette.characterName] = palette.entries;
        } else {
          failed += 1;
          console.error('[CCFOLIA ステータス変更]', `「${name}」のパレットが読み取れませんでした（発言者「${palette?.characterName || ''}」、項目${palette?.entries?.length ?? 0}件）。`);
        }
      } catch (reason) {
        failed += 1;
        console.error('[CCFOLIA ステータス変更]', reason);
        chatStatus.textContent = `パレット取得: ${reason.message}`;
      }
    }
    return { items, failed };
  };

  // 「再取得」で、キャラ情報・チャットパレット・シーン・チャットログをまとめて取得します。
  // 保存済みでもパレット・シーンをCCFOLIA側から
  // 必ず取り直します。パレットは、全キャラクターぶんを一人ずつ読み込んでキャラごとに保存し、
  // 元の発言者へ戻します（/g や技能パレットは発言者に対応した技能だけを出せるようになります）。
  const updateEverything = async ({ force = true } = {}) => {
    if (refreshScanButton.disabled) return;
    refreshScanButton.disabled = true;
    openChatPaletteButton.disabled = true;
    refreshChatPaletteButton.disabled = true;
    // CCFOLIA本体側を操作して取得するので、拡張チャットのオーバーレイが開いていたら一時的に隠します。
    await pauseChatOverlay();
    try {
      status.textContent = 'キャラクター情報を取得しています…';
      // キャラ情報の取得に失敗しても、パレット・シーンの取得は続けます。
      // （パレットの人数ぶんの走査は、キャラクター選択メニューの候補からも実行できるため。）
      try {
        const result = await requestTimeout(
          chrome.runtime.sendMessage({ type: 'CCFOLIA_ACQUIRE_CHARACTERS' }), 300, 'キャラクター情報の取得'
        );
        if (!result?.ok) throw new Error(result?.error || 'キャラクター情報を取得できませんでした。');
        storeAcquiredCharacters(result.characters);
      } catch (reason) {
        console.error('[CCFOLIA ステータス変更]', reason);
        chatStatus.textContent = `キャラクター情報: ${reason.message}`;
      }
      const characterCount = acquiredCharacters.length;
      let paletteCount = null;
      let paletteCharacters = null;
      let sceneCount = null;
      if (force) {
        // 再走査: 「キャラクター選択」メニューで選べるキャラを順に選び、選ぶたびに
        // チャットパレット（ListAltIconのボタン）を開いて読み込みます。
        chatPalettePanel.hidden = false;
        chatPaletteItems.replaceChildren();
        chatPaletteStatus.textContent = '全キャラクターのチャットパレットを取得しています…';
        const originalName = speakerCharacterName();
        let items = {};
        let failed = 0;
        try {
          const scan = await requestTimeout(
            sendRequest('CCFOLIA_CHAT_PALETTE_SCAN_ALL'), 600, '全キャラクターのチャットパレット取得'
          );
          if (!scan?.ok) throw new Error(scan?.error || 'パレットを走査できませんでした。');
          items = scan.items ?? {};
          failed = scan.failed ?? 0;
        } catch (reason) {
          // 巡回方式に失敗したときは、従来どおり名前を指定して切り替える方式で読み込みます。
          console.error('[CCFOLIA ステータス変更]', reason);
          chatStatus.textContent = '選択メニューの巡回でパレットを取得できなかったため、名前指定で読み込みます。';
          const fallback = await acquirePalettesPerName();
          items = fallback.items;
          failed = fallback.failed;
        }
        if (Object.keys(items).length) {
          chatPaletteMap = { ...chatPaletteMap, ...items };
          savePaletteMap();
        }
        // 元の発言者へ戻します（content側でも戻すため、呼び出しは二重になっても害はありません）。
        if (originalName) {
          try {
            await requestTimeout(sendRequest('CCFOLIA_CHAT_SELECT_CHARACTER', { name: originalName, key: '' }), 30, '元の発言者への復帰');
          } catch (reason) {
            console.error('[CCFOLIA ステータス変更]', reason);
          }
        }
        syncPaletteEntries();
        renderChatPalette();
        const values = Object.values(chatPaletteMap);
        paletteCharacters = Object.keys(chatPaletteMap).length;
        paletteCount = values.reduce((sum, entries) => sum + entries.length, 0);
        if (failed > 0) chatStatus.textContent = `パレット: ${failed}キャラの取得に失敗しました。`;
      } else if (!chatPaletteEntries.length) {
        chatPalettePanel.hidden = false;
        chatPaletteItems.replaceChildren();
        chatPaletteStatus.textContent = 'チャットパレットを取得しています…';
        try {
          await requestTimeout(fetchChatPaletteEntries(), 180, 'チャットパレットの取得');
          paletteCount = chatPaletteEntries.length;
          renderChatPalette();
        } catch (reason) {
          console.error('[CCFOLIA ステータス変更]', reason);
          chatStatus.textContent = `チャットパレット: ${reason.message}`;
        }
      }
      if (force || !sceneEntries.length) {
        try {
          status.textContent = 'シーン一覧を取得しています…';
          await requestTimeout(fetchSceneEntries(), 120, 'シーン一覧の取得');
          sceneCount = sceneEntries.length;
        } catch (reason) {
          console.error('[CCFOLIA ステータス変更]', reason);
          chatStatus.textContent = `シーン一覧: ${reason.message}`;
        }
      }
      // 取得のためにCCFOLIA側で開いたシーン表・チャットパレット・メニューを閉じておきます。
      try {
        await requestTimeout(sendRequest('CCFOLIA_CLEANUP_UI'), 60, '画面の後片付け');
      } catch {
        // 閉じ損ねても処理は続けます（Escapeなど個別の閉じ処理は各取得側でも行っています）。
      }
      // キャラクター選択メニューの読み取りはチャットの入力欄で行うため、先に開いておきます。
      await requestTimeout(sendRequest('CCFOLIA_CHAT_OPEN_DRAWER'), 10, 'チャットウィンドウを開く');
      await refreshChatState({ force: true, includeCharacters: true });
      const paletteText = paletteCount !== null
        ? `、パレット${paletteCharacters && paletteCharacters > 0 ? `${paletteCharacters}キャラ分` : ''}${paletteCount}件`
        : '';
      status.textContent = `${force ? '再走査しました' : '更新しました'}（キャラクター${characterCount}人${paletteText}${sceneCount !== null ? `、シーン${sceneCount}件` : ''}）。`;
    } catch (reason) {
      console.error('[CCFOLIA ステータス変更]', reason);
      status.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      // 先にオーバーレイを元に戻してから、制御ウィンドウ側の後片付けをします。
      await resumeChatOverlay();
      refreshScanButton.disabled = false;
      openChatPaletteButton.disabled = false;
      refreshChatPaletteButton.disabled = false;
      // 技能表（チャットパレット面板）と設定画面を閉じて、すっきりした状態にします。
      chatPalettePanel.hidden = true;
      if (setupSection) {
        setupSection.open = false;
        settingsToggle?.setAttribute('aria-expanded', 'false');
      }
    }
  };
  refreshScanButton.addEventListener('click', () => void updateEverything({ force: true }));

  charactersElement.addEventListener('change', (event) => {
    const select = event.target.closest('.character-number');
    if (!select) return;
    const character = acquiredCharacters?.find((item) => item.id === select.dataset.characterId);
    if (!character) return;
    const number = select.value ? Number(select.value) : null;
    if (number !== null && acquiredCharacters.some((item) => item !== character && Number(item.commandNumber) === number)) {
      status.textContent = `番号${number}はすでに別のキャラクターに割り当てられています。`;
      renderCharacterChoices();
      return;
    }
    character.commandNumber = number;
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(acquiredCharacters));
    syncCommandMap();
    renderCharacterChoices();
  });

  // CCFOLIA側のチャットパレットを開いて全項目を走査し、発言者ごとにlocalStorageへ保存します。
  const fetchChatPaletteEntries = async () => {
    const result = await sendRequest('CCFOLIA_CHAT_PALETTE');
    chatPaletteEntries = result.entries ?? [];
    const name = (typeof result.characterName === 'string' && result.characterName) ? result.characterName : speakerCharacterName();
    if (name) {
      chatPaletteMap = { ...chatPaletteMap, [name]: chatPaletteEntries };
      savePaletteMap();
    }
    savePaletteEntries();
    // 取得した配列をフォールバックの参照とも合わせておきます。
    legacyPaletteEntries = chatPaletteEntries;
    return chatPaletteEntries;
  };

  // CCFOLIA側のシーンパネルを開いて全シーン名を走査し、結果をlocalStorageへ保存します。
  const fetchSceneEntries = async () => {
    const result = await sendRequest('CCFOLIA_SCENE_LIST');
    sceneEntries = result.entries ?? [];
    saveSceneEntries();
    // 一覧取得時に現在のシーンも判断できれば、そちらを優先して記憶します。
    if (typeof result.current === 'string' && result.current) {
      currentSceneName = result.current;
      saveCurrentScene();
    }
    return sceneEntries;
  };
  // /s で候補が出ないときに、最初の1回だけ自動で取得します。
  const ensureSceneEntries = async () => {
    if (sceneEntries.length) return sceneEntries;
    chatStatus.textContent = 'シーン一覧を取得しています…';
    // シーン一覧の取得はCCFOLIA本体側のパネルを操作するので、オーバーレイを一時的に隠します。
    await pauseChatOverlay();
    try {
      await fetchSceneEntries();
    } finally {
      await resumeChatOverlay();
    }
    chatStatus.textContent = '';
    return sceneEntries;
  };

  // 保存済みの一覧に関係なく、CCFOLIA側を走査し直して更新します。
  const refetchChatPalette = async () => {
    openChatPaletteButton.disabled = true;
    refreshChatPaletteButton.disabled = true;
    chatPaletteStatus.textContent = 'パレットを読み込んでいます…';
    chatPalettePanel.hidden = false;
    chatPaletteItems.replaceChildren();
    // CCFOLIA本体側のパレットを操作して取得するので、オーバーレイを一時的に隠します。
    await pauseChatOverlay();
    try {
      await fetchChatPaletteEntries();
      renderChatPalette();
    } catch (reason) {
      chatStatus.textContent = reason.message;
      chatPalettePanel.hidden = true;
    } finally {
      await resumeChatOverlay();
      openChatPaletteButton.disabled = false;
      refreshChatPaletteButton.disabled = false;
    }
  };

  // 保存済みのパレットがあればCCFOLIA側を操作せず、そのまま表示します。
  openChatPaletteButton.addEventListener('click', () => {
    if (!chatPaletteEntries.length) {
      void refetchChatPalette();
      return;
    }
    renderChatPalette();
    chatPalettePanel.hidden = false;
  });
  refreshChatPaletteButton.addEventListener('click', () => void refetchChatPalette());
  closeChatPaletteButton.addEventListener('click', () => {
    chatPalettePanel.hidden = true;
  });
  clearMessageButton.addEventListener('click', () => {
    chatInput.value = '';
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    chatInput.focus();
  });
  // 入力履歴。送信したメッセージを記憶し、↑/↓キーで呼び出します（50件・保存先はlocalStorage）。
  const INPUT_HISTORY_STORAGE_KEY = 'ccfolia-input-history-v1';
  const INPUT_HISTORY_LIMIT = 50;
  const readInputHistory = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(INPUT_HISTORY_STORAGE_KEY) || 'null');
      return Array.isArray(stored) ? stored.filter((entry) => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  };
  let inputHistory = readInputHistory();
  // 現在どこまで履歴をさかのぼっているか。-1は「履歴ではなく入力欄そのもの」を指します。
  let inputHistoryIndex = -1;
  // 履歴へ入り込む前の入力内容。↓で最新まで戻ったときに復元します。
  let inputHistoryDraft = '';
  const rememberInputHistory = (text) => {
    inputHistoryIndex = -1;
    inputHistoryDraft = '';
    // 送信済みの送信順で積みます。直前の履歴と同じ文は記録し直さない（重複を圧縮）。
    if (!text || text === inputHistory.at(-1)) return;
    inputHistory.push(text);
    while (inputHistory.length > INPUT_HISTORY_LIMIT) inputHistory.shift();
    try {
      localStorage.setItem(INPUT_HISTORY_STORAGE_KEY, JSON.stringify(inputHistory));
    } catch {
      // 保存に失敗しても、セッション内の履歴として機能し続けます。
    }
  };
  // 履歴をたどります。step+:過去へ / step-:未来(入力欄)へ。動けたときだけtrueを返します。
  const moveInputHistory = (step) => {
    const next = inputHistoryIndex + step;
    if (next >= inputHistory.length) return false;
    if (next < -1) return false;
    if (inputHistoryIndex === -1) inputHistoryDraft = chatInput.value;
    inputHistoryIndex = next;
    chatInput.value = next === -1 ? inputHistoryDraft : inputHistory[next];
    // キャレットを末尾へ置き、技能パレット・コマンド候補の表示も入力内容に合わせ直します。
    chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  sendButton.addEventListener('click', async () => {
    if (sendButton.disabled) return;
    const originalText = chatInput.value;
    if (!originalText.trim()) return;
    rememberInputHistory(originalText);
    // CCFOLIA側の送信処理を待たず、入力欄を即座にクリアします（失敗時は元の内容に戻します）。
    chatInput.value = '';
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    sendButton.disabled = true;
    let failure = null;
    try {
      const selectedTab = selectedTabIndex;
      await sendRequest('CCFOLIA_CHAT_SEND', {
        text: originalText,
        ...(selectedTab !== null && selectedTab !== '' ? { tabIndex: Number(selectedTab) } : {})
      });
    } catch (reason) {
      failure = reason;
    }
    // 送信が確定した時点で入力を受け付けるようにします。ログの再取得は後処理で行うため、
    // 完了までボタンを押せなくなる「送信できない時間」を作りません。
    sendButton.disabled = false;
    if (failure) {
      chatStatus.textContent = failure.message;
      chatInput.value = originalText;
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      chatInput.focus();
      return;
    }
    chatInput.focus();
    void refreshChatState();
  });
  chatInput.addEventListener('input', () => {
    if (!renderCommandSuggestions()) showSkillSuggestions(chatInput.value);
  });
  // 検索語が変わったら、最新の状態をもう一度描き直して絞り込みを反映します。
  logSearchInput?.addEventListener('input', () => {
    logSearchQuery = logSearchInput.value;
    if (latestChatState) renderChatState(latestChatState);
  });

  // CCFOLIA側でチャットログが変わるたび、ポーリングを待たずに即座に反映します。
  // content.js が CCFOLIA_CHAT_LOG_PUSH で最新メッセージ一覧を送ってくるので書き換えます。
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'CCFOLIA_CHAT_LOG_PUSH' || !Array.isArray(message.messages)) return undefined;
    if (!latestChatState) return undefined; // 初回は通常のポーリングで取得します。
    const previous = latestChatState.messages ?? [];
    const incoming = message.messages;
    if (incoming.length === previous.length
      && JSON.stringify(incoming.at(-1) ?? '') === JSON.stringify(previous.at(-1) ?? '')) return undefined;
    renderChatState({ ...latestChatState, messages: incoming });
    return undefined;
  });

  chatInput.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    // 候補の操作は「これから入力欄に入っているのが本物のコマンド入力（/m /g /g /s /a）のときだけ」有効です。
    // 入力欄が空のまま候補操作の状態が残っていても、Tabで選択が動かないようにします。
    const commandActive = Boolean(!commandSuggestions?.hidden && commandMatches.length
      && parseCommandInput(chatInput.value));
    // Tab補完（fzf風）。Tabで下へ、Shift+Tabで上へ選択を移動します（入力欄は書き換えません）。
    if (event.key === 'Tab' && commandActive) {
      event.preventDefault();
      moveCommandSelection(event.shiftKey ? -1 : 1);
      return;
    }
    // 上下キーでもハイライトを移動します。
    if (commandActive && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const count = commandMatches.length;
      commandIndex = ((commandIndex + (event.key === 'ArrowDown' ? 1 : -1)) % count + count) % count;
      renderCommandSuggestions();
      return;
    }
    // Escで候補を閉じます。
    if (commandActive && event.key === 'Escape') {
      event.preventDefault();
      hideCommandSuggestions();
      return;
    }
    // 入力履歴。コマンド候補の操作中でないとき、↑/↓で送信履歴をたどります。
    // ↑はキャレットが1行目、↓は最終行のときだけ発動し、複数行入力のカーソル移動を妨げません。
    if (!commandActive && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const value = chatInput.value;
      const selectionStart = chatInput.selectionStart ?? 0;
      const selectionEnd = chatInput.selectionEnd ?? 0;
      const atBoundary = event.key === 'ArrowUp'
        ? value.slice(0, selectionStart).indexOf('\n') === -1
        : value.slice(selectionEnd).indexOf('\n') === -1;
      if (atBoundary) {
        event.preventDefault();
        moveInputHistory(event.key === 'ArrowUp' ? 1 : -1);
        return;
      }
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    // コマンド入力中（/m /g /c）は候補の実行を優先し、通常のメッセージ送信は行いません。
    if (parseCommandInput(chatInput.value)) {
      renderCommandSuggestions();
      void executeCommand();
      return;
    }
    sendButton.click();
  });
  characterChoice.addEventListener('change', async () => {
    const selected = characterChoice.selectedOptions[0];
    const name = selected?.dataset.characterName;
    const key = selected?.dataset.characterKey;
    if (!name && !key) return;
    try {
      await sendRequest('CCFOLIA_CHAT_SELECT_CHARACTER', { name, key });
      await refreshChatState({ force: true, includeCharacters: true });
      // 技能パレット・入力補助の表示を、切り替え先キャラのパレットに合わせて更新します。
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (reason) {
      chatStatus.textContent = reason.message;
    }
  });

  // 設定のバックアップ。拡張ページが持つ localStorage（テーマ・フォント・alias・パレット・シーン等）と
  // chrome.storage.local（コマンドマップ・キャラ番号割当・オーバーレイの状態）をJSONで出し入れします。
  const CHROME_STORAGE_KEYS = ['ccfoliaCommandMap', 'ccfoliaCharacters', 'ccfoliaChatOverlayMode', 'ccfoliaChatOverlayBounds'];
  settingsExportButton?.addEventListener('click', async () => {
    try {
      // localStorage側は拡張機能のキー（ccfoliaで始まるもの）をすべて書き出します。
      const local = {};
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith('ccfolia')) local[key] = localStorage.getItem(key);
      }
      const storage = await chrome.storage.local.get(CHROME_STORAGE_KEYS);
      settingsIoJson.value = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), local, storage }, null, 2);
      settingsIoJson.select();
      status.textContent = '設定を書き出しました。表示されたテキストをコピーして保管してください。';
    } catch (reason) {
      status.textContent = `設定の書き出しに失敗しました: ${reason.message}`;
    }
  });
  settingsImportButton?.addEventListener('click', async () => {
    let payload = null;
    try {
      payload = JSON.parse(settingsIoJson.value);
    } catch {
      status.textContent = 'JSONを読み取れませんでした。「書き出す」で作ったテキストを貼り付けてください。';
      return;
    }
    if (!payload || typeof payload !== 'object') {
      status.textContent = '書き出したテキストが空です。「書き出す」を実行してから試してください。';
      return;
    }
    try {
      // localStorage側を復元します（ccfoliaで始まるキーのみ・値は文字列のみ）。
      for (const [key, value] of Object.entries(payload.local ?? {})) {
        if (key.startsWith('ccfolia') && typeof value === 'string') localStorage.setItem(key, value);
      }
      // chrome.storage側を復元します（書き出し時に存在したキーだけ）。
      const restore = {};
      const storage = payload.storage;
      if (storage && typeof storage === 'object') {
        for (const key of CHROME_STORAGE_KEYS) {
          if (key in storage) restore[key] = storage[key];
        }
      }
      if (Object.keys(restore).length) await chrome.storage.local.set(restore);
      status.textContent = '設定を読み込みました。まもなく再読み込みします…';
      setTimeout(() => window.location.reload(), 800);
    } catch (reason) {
      status.textContent = `設定の読み込みに失敗しました: ${reason.message}`;
    }
  });

  // 保存済みの待ち時間を復元し、ONなら自動削除モードをルーム側へ再適用します。
  const storedInterval = Number(storedAutoDeleteMode?.intervalSeconds);
  if (Number.isFinite(storedInterval) && storedInterval >= 0.1 && storedInterval <= 3600) {
    autoSkipInterval.value = String(storedInterval);
  }
  void applyAutoDeleteMode();

  applyTheme(readStoredTheme());
  applyFont(readStoredFont());
  applyFontSize(readStoredFontSize());
  renderCharacterChoices();
  renderDiceControls();
  renderAliasButtons();
  renderAliasEditor();
  applyAliasButtonsVisibility();
  syncCommandMap();
  void refreshChatState({ force: true, includeCharacters: true });
  void syncAutoSkipStatus();
  window.setInterval(() => void refreshChatState({ force: false }), 3000);
  window.setInterval(() => void syncAutoSkipStatus(), 1000);
})();
