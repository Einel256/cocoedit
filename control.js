(() => {
  'use strict';

  const acquireAllButton = document.getElementById('acquire-all');
  const charactersElement = document.getElementById('characters');
  const status = document.getElementById('status');
  const chatStatus = document.getElementById('chat-status');
  const chatTabs = document.getElementById('chat-tabs');
  const chatLog = document.getElementById('chat-log');
  const chatInput = document.getElementById('chat-input');
  const sendButton = document.getElementById('send-message');
  const clearMessageButton = document.getElementById('clear-message');
  const refreshChatButton = document.getElementById('refresh-chat');
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
  const autoDeleteToggle = document.getElementById('auto-delete-toggle');
  const autoSkipInterval = document.getElementById('auto-skip-interval');
  const skipStatus = document.getElementById('skip-status');
  const settingsToggle = document.getElementById('toggle-settings');
  const setupSection = document.querySelector('.setup-section');
  const themeSelect = document.getElementById('theme-select');
  const THEME_STORAGE_KEY = 'ccfolia-theme-v1';
  const CHARACTER_STORAGE_KEY = 'ccfolia-status-characters-v1';
  const PALETTE_STORAGE_KEY = 'ccfolia-chat-palette-v1';
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

  let acquiredCharacters = readStoredCharacters();
  let latestChatState = null;
  // チャットパレットの取得結果を保存し、開くたびにCCFOLIA側を走査しなくて済むようにします。
  const readStoredPalette = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(PALETTE_STORAGE_KEY) || 'null');
      return Array.isArray(stored) ? stored.filter((entry) => typeof entry === 'string') : null;
    } catch {
      return null;
    }
  };
  let chatPaletteEntries = readStoredPalette() ?? [];
  const savePaletteEntries = () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(chatPaletteEntries));
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

  chatTabs.addEventListener('change', async () => {
    const index = Number(chatTabs.value);
    if (!Number.isInteger(index)) return;
    try {
      await sendRequest('CCFOLIA_CHAT_SELECT_TAB', { index });
      await refreshChatState();
    } catch (reason) {
      chatStatus.textContent = reason.message;
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

  // CCBなどのロール結果（…ここから　 (1D100<=68) ＞ 57 ＞ 成功　ここまで…）を色付けします。
  const ROLL_SUCCESS_COLOR = '#2089dc';
  const ROLL_FAILURE_COLOR = '#d1004a';
  // innerTextに紛れない zero-width 文字を除去します所在（あると正規表現が一致しません）。
  const stripInvisibleChars = (text) => (text ?? '').replace(/[\u200b\u200c\u200d\u2060]/g, '');
  // (1D100<=70) ＞ 20 ＞ 成功 を検出します。数値の表記揺れ（[20]、改行、20 / 100 など）を
  // 許容しつつ、技能名や会話文中の「成功」「失敗」には反応しません。
  const rollFormulaPattern = /\(\s*\d+D\d+[^)\n]*\)/;
  const rollKeywordPattern = /(ファンブル|失敗|成功)/;
  const rollResultColor = (segment) => {
    const formula = segment.match(rollFormulaPattern);
    if (!formula) return null;
    const regionStart = formula.index + formula[0].length;
    const region = segment.slice(regionStart, regionStart + 60);
    const separator = region.search(/[＞>]/);
    if (separator < 0) return null;
    const keyword = region.slice(separator + 1).match(rollKeywordPattern);
    if (!keyword) return null;
    return keyword[1] === '成功' ? ROLL_SUCCESS_COLOR : ROLL_FAILURE_COLOR;
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
      appendRollResultSpan(container, value.slice(formulaMatch.index, end), keyword[1] === '成功' ? ROLL_SUCCESS_COLOR : ROLL_FAILURE_COLOR);
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
      const color = withinSegment ? rollResultColor(buffer) : null;
      if (color) appendRollResultSpan(container, buffer, color);
      else container.append(buffer);
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
    for (const tab of chatState.tabs ?? []) {
      const option = new Option(tab.name, String(tab.index));
      option.selected = Boolean(tab.selected);
      chatTabs.append(option);
      if (tab.selected) selectedTab = String(tab.index);
    }
    if (selectedTab !== null) chatTabs.value = selectedTab;

    const previousScrollBottom = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 48;
    chatLog.replaceChildren();
    for (const message of chatState.messages ?? []) {
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

    speakerAvatar.src = chatState.speakerAvatar ?? '';
    speakerAvatar.hidden = !chatState.speakerAvatar;
    const currentCharacter = characterChoice.value;
    // キャラクター選択プルダウン。選択肢はキャラクターのみで（選択なし・状態表記なし）。
    // CCFOLIA側の現在の発言者にプルダウンを追従させます。
    characterChoice.replaceChildren();
    let matchedOption = null;
    for (const character of chatState.characters ?? []) {
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

  };

  // ダイスショートカット。同じボタンを連続クリックした回数で個数を決めます。
  // 1回目で 1d6 を挿入し、続けて押すと挿入済みの式を 2d6、3d6 …へ差し替えます。
  // 別のダイスボタンを押すと連続カウントはリセットされます。
  const diceLastInsert = new Map();
  const insertDiceFormula = (sides) => {
    for (const key of [...diceLastInsert.keys()]) {
      if (key !== sides) diceLastInsert.delete(key);
    }
    let start = chatInput.selectionStart ?? chatInput.value.length;
    let end = chatInput.selectionEnd ?? start;
    let count = 1;
    const previous = diceLastInsert.get(sides);
    const previousFormula = previous ? `${previous.count}d${sides}` : null;
    if (previous && previousFormula
      && previous.start >= 0 && previous.end <= chatInput.value.length
      && chatInput.value.slice(previous.start, previous.end) === previousFormula) {
      count = previous.count + 1;
      start = previous.start;
      end = previous.end;
    }
    const formula = `${count}d${sides}`;
    chatInput.setRangeText(formula, start, end, 'end');
    diceLastInsert.set(sides, { start, end: start + formula.length, count });
    chatInput.focus();
    chatInput.selectionStart = chatInput.selectionEnd = start + formula.length;
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
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
    const filtered = chatPaletteEntries.filter((entry) =>
      entry.toLocaleLowerCase().includes(q.toLocaleLowerCase())
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

  /* /m /g /c コマンド。fzf風のTab補完で選択します。
     /m = チャットタブ移動 /g = 技能選択（チャットパレット） /c = キャラ選択 */
  const commandSuggestions = document.getElementById('command-suggestions');
  let commandMode = null; // 'm' | 'g' | 'c'
  let commandMatches = [];
  let commandIndex = 0;
  let commandQuery = null;
  // 「/m」「/g」「/c」の入力をコマンドとして扱います（半角スペースは任意）。
  const parseCommandInput = (value) => {
    const match = value.match(/^\/([mgc])(.*)$/);
    if (!match) return null;
    return { mode: match[1], query: match[2].replace(/^\s+/, '') };
  };

  const commandCandidates = (mode) => {
    if (mode === 'm') {
      return (latestChatState?.tabs ?? []).map((tab) => ({ label: tab.name, tab }));
    }
    if (mode === 'g') {
      return chatPaletteEntries.map((entry) => ({ label: entry, value: entry }));
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
    return 'キャラクター候補がありません。「更新」または「一括取得」で候補を取得してください。';
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
    // モード・絞り込み語が変わったらハイライトを先頭へ戻します。
    if (parsed.mode !== commandMode || parsed.query !== commandQuery) commandIndex = 0;
    commandMode = parsed.mode;
    commandQuery = parsed.query;
    // 絞り込みはスペース区切りの複数語のAND一致（fzf風）です。
    commandMatches = commandCandidates(commandMode)
      .filter((candidate) => matchesCommandQuery(candidate.label, parsed.query));
    commandSuggestions.replaceChildren();
    if (!commandMatches.length) {
      const empty = document.createElement('span');
      empty.className = 'suggestion-empty';
      empty.textContent = commandEmptyMessage(commandMode);
      commandSuggestions.append(empty);
      commandIndex = -1;
    } else {
      if (commandIndex >= commandMatches.length) commandIndex = 0;
      commandMatches.forEach((candidate, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'skill-suggestion-item';
        button.classList.toggle('is-highlighted', index === commandIndex);
        button.textContent = candidate.label;
        button.title = candidate.label;
        button.addEventListener('click', () => {
          commandIndex = index;
          void executeCommand();
        });
        commandSuggestions.append(button);
      });
    }
    commandSuggestions.hidden = false;
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
    if (!count || commandIndex < 0 || commandIndex >= count) {
      chatStatus.textContent = commandEmptyMessage(commandMode ?? 'm');
      chatInput.value = '';
      hideCommandSuggestions();
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const selected = commandMatches[commandIndex];
    if (commandMode === 'g') {
      // 技能を選択したら、そのテキストを入力欄に置きます（送信はしません）。
      chatInput.value = selected.value;
      hideCommandSuggestions();
      chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
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
      ? `${chatPaletteEntries.length}件`
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

  // キャラ情報・チャットパレット・チャットログを一括で取得します。
  acquireAllButton.addEventListener('click', async () => {
    acquireAllButton.disabled = true;
    openChatPaletteButton.disabled = true;
    refreshChatPaletteButton.disabled = true;
    try {
      status.textContent = 'キャラクター情報を取得しています…';
      const result = await chrome.runtime.sendMessage({ type: 'CCFOLIA_ACQUIRE_CHARACTERS' });
      if (!result?.ok) throw new Error(result?.error || 'キャラクター情報を取得できませんでした。');
      storeAcquiredCharacters(result.characters);
      const characterCount = acquiredCharacters.length;
      let paletteCount = null;
      chatPalettePanel.hidden = false;
      chatPaletteItems.replaceChildren();
      chatPaletteStatus.textContent = 'チャットパレットを取得しています…';
      try {
        await fetchChatPaletteEntries();
        paletteCount = chatPaletteEntries.length;
        renderChatPalette();
      } catch (reason) {
        console.error('[CCFOLIA ステータス変更]', reason);
        chatPalettePanel.hidden = true;
        chatStatus.textContent = `チャットパレット: ${reason.message}`;
      }
      await refreshChatState({ force: true, includeCharacters: true });
      status.textContent = `一括取得しました（キャラクター${characterCount}人${paletteCount !== null ? `、パレット${paletteCount}件` : ''}）。`;
    } catch (reason) {
      console.error('[CCFOLIA ステータス変更]', reason);
      status.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      acquireAllButton.disabled = false;
      openChatPaletteButton.disabled = false;
      refreshChatPaletteButton.disabled = false;
    }
  });

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

  refreshChatButton.addEventListener('click', () => void refreshChatState({ force: true, includeCharacters: true }));

  themeSelect.addEventListener('change', (event) => {
    applyTheme(event.target.value);
  });
  // CCFOLIA側のチャットパレットを開いて全項目を走査し、結果をlocalStorageへ保存します。
  const fetchChatPaletteEntries = async () => {
    const result = await sendRequest('CCFOLIA_CHAT_PALETTE');
    chatPaletteEntries = result.entries ?? [];
    savePaletteEntries();
    return chatPaletteEntries;
  };

  // 保存済みの一覧に関係なく、CCFOLIA側を走査し直して更新します。
  const refetchChatPalette = async () => {
    openChatPaletteButton.disabled = true;
    refreshChatPaletteButton.disabled = true;
    chatPaletteStatus.textContent = 'パレットを読み込んでいます…';
    chatPalettePanel.hidden = false;
    chatPaletteItems.replaceChildren();
    try {
      await fetchChatPaletteEntries();
      renderChatPalette();
    } catch (reason) {
      chatStatus.textContent = reason.message;
      chatPalettePanel.hidden = true;
    } finally {
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
  sendButton.addEventListener('click', async () => {
    const originalText = chatInput.value;
    if (!originalText.trim()) return;
    // CCFOLIA側の送信処理を待たず、入力欄を即座にクリアします（失敗時は元の内容に戻します）。
    chatInput.value = '';
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    sendButton.disabled = true;
    try {
      const selectedTab = chatTabs.value;
      await sendRequest('CCFOLIA_CHAT_SEND', {
        text: originalText,
        ...(selectedTab !== '' ? { tabIndex: Number(selectedTab) } : {})
      });
      await refreshChatState();
    } catch (reason) {
      chatStatus.textContent = reason.message;
      chatInput.value = originalText;
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    } finally {
      sendButton.disabled = false;
      chatInput.focus();
    }
  });
  chatInput.addEventListener('input', () => {
    if (!renderCommandSuggestions()) showSkillSuggestions(chatInput.value);
  });

  chatInput.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    const commandActive = Boolean(!commandSuggestions?.hidden && commandMatches.length);
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
    } catch (reason) {
      chatStatus.textContent = reason.message;
    }
  });

  // 保存済みの待ち時間を復元し、ONなら自動削除モードをルーム側へ再適用します。
  const storedInterval = Number(storedAutoDeleteMode?.intervalSeconds);
  if (Number.isFinite(storedInterval) && storedInterval >= 0.1 && storedInterval <= 3600) {
    autoSkipInterval.value = String(storedInterval);
  }
  void applyAutoDeleteMode();

  applyTheme(readStoredTheme());
  renderCharacterChoices();
  renderDiceControls();
  syncCommandMap();
  void refreshChatState({ force: true, includeCharacters: true });
  void syncAutoSkipStatus();
  window.setInterval(() => void refreshChatState({ force: false }), 10000);
  window.setInterval(() => void syncAutoSkipStatus(), 1000);
})();
