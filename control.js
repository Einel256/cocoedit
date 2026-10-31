(() => {
  'use strict';

  const acquireButton = document.getElementById('acquire');
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
  const speakerNameInput = document.getElementById('speaker-name');
  const speakerAvatar = document.getElementById('speaker-avatar');
  const characterChoice = document.getElementById('character-choice');
  const chatPalettePanel = document.getElementById('chat-palette-panel');
  const chatPaletteSearch = document.getElementById('chat-palette-search');
  const chatPaletteItems = document.getElementById('chat-palette-items');
  const chatPaletteStatus = document.getElementById('chat-palette-status');
  const closeChatPaletteButton = document.getElementById('close-chat-palette');
  const diceShortcuts = document.getElementById('dice-shortcuts');
  const diceCount = document.getElementById('dice-count');
  const autoDeleteToggle = document.getElementById('auto-delete-toggle');
  const autoSkipInterval = document.getElementById('auto-skip-interval');
  const skipStatus = document.getElementById('skip-status');
  const settingsToggle = document.getElementById('toggle-settings');
  const setupSection = document.querySelector('.setup-section');
  const CHARACTER_STORAGE_KEY = 'ccfolia-status-characters-v1';
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
  let acquiredCharacters = readStoredCharacters();
  let latestChatState = null;
  let chatPaletteEntries = [];
  let selectedDiceCount = 1;

  const syncCommandMap = () => {
    const commandMap = Object.fromEntries((acquiredCharacters ?? [])
      .filter((character) => Number.isInteger(Number(character.commandNumber)) && Number(character.commandNumber) >= 1 && Number(character.commandNumber) <= 9)
      .map((character) => [String(character.commandNumber), character.id]));
    chrome.runtime.sendMessage({ type: 'CCFOLIA_SAVE_COMMAND_MAP', commandMap }).catch((reason) => {
      console.error('[CCFOLIA ステータス変更] 番号設定を同期できませんでした。', reason);
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
      const messageText = message.text ?? (typeof message === 'string' ? message : '');
      const ccbCommand = /CCB\s*<=\s*\d+/i.exec(messageText);
      if (ccbCommand) {
        const commandEnd = ccbCommand.index + ccbCommand[0].length;
        const resultText = messageText.slice(commandEnd);
        const resultClass = /失敗|ファンブル/i.test(resultText)
          ? 'ccb-result-failure'
          : /成功|クリティカル|スペシャル|イクストリーム|エクストリーム/i.test(resultText)
            ? 'ccb-result-success'
            : '';
        text.append(document.createTextNode(messageText.slice(0, commandEnd)));
        if (resultClass) {
          const result = document.createElement('span');
          result.className = resultClass;
          result.textContent = resultText;
          text.append(result);
        } else {
          text.append(document.createTextNode(resultText));
        }
      } else {
        text.textContent = messageText;
      }
      content.append(header, text);
      item.append(content);
      chatLog.append(item);
    }
    if (previousScrollBottom) chatLog.scrollTop = chatLog.scrollHeight;

    if (document.activeElement !== speakerNameInput) speakerNameInput.value = chatState.speakerName ?? '';
    speakerAvatar.src = chatState.speakerAvatar ?? '';
    speakerAvatar.hidden = !chatState.speakerAvatar;
    const currentCharacter = characterChoice.value;
    characterChoice.replaceChildren(new Option('選択なし', ''));
    for (const character of chatState.characters ?? []) {
      const name = character.name || `キャラクター${character.index + 1}`;
      const value = character.key || String(character.index);
      const option = new Option(name, value);
      option.dataset.state = character.state || '';
      option.dataset.characterName = character.name || '';
      option.dataset.characterKey = character.key || '';
      if (character.state) option.textContent = `${name} (${character.state})`;
      characterChoice.append(option);
    }
    if ([...characterChoice.options].some((option) => option.value === currentCharacter)) {
      characterChoice.value = currentCharacter;
    } else if ([...characterChoice.options].some((option) => option.dataset.characterName === chatState.speakerName)) {
      characterChoice.value = [...characterChoice.options].find((option) => option.dataset.characterName === chatState.speakerName)?.value ?? '';
    }

  };

  const renderDiceControls = () => {
    diceShortcuts.replaceChildren();
    diceCount.replaceChildren();
    for (const sides of [2, 3, 4, 6, 8, 10, 12, 20, 100]) {
      const formula = `${selectedDiceCount}d${sides}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `d${sides}`;
      button.setAttribute('aria-label', `${formula}を入力`);
      button.addEventListener('click', () => insertChatInputText(formula));
      diceShortcuts.append(button);
    }
    const sanButton = document.createElement('button');
    sanButton.type = 'button';
    sanButton.textContent = 'SAN';
    sanButton.setAttribute('aria-label', '正気度ロールを入力');
    sanButton.addEventListener('click', () => insertChatInputText('1d100<={SAN} 【正気度ロール】'));
    diceShortcuts.append(sanButton);
    for (let count = 1; count <= 4; count += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(count);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(count === selectedDiceCount));
      button.classList.toggle('is-selected', count === selectedDiceCount);
      button.addEventListener('click', () => {
        selectedDiceCount = count;
        renderDiceControls();
      });
      diceCount.append(button);
    }
  };

  const insertChatInputText = (text) => {
    const start = chatInput.selectionStart ?? chatInput.value.length;
    const end = chatInput.selectionEnd ?? start;
    chatInput.setRangeText(text, start, end, 'end');
    chatInput.focus();
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const renderChatPalette = () => {
    const query = chatPaletteSearch.value.trim().toLocaleLowerCase();
    const filteredEntries = chatPaletteEntries.filter((entry) => entry.toLocaleLowerCase().includes(query));
    chatPaletteItems.replaceChildren();
    for (const entry of filteredEntries) {
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
    chatPaletteStatus.textContent = filteredEntries.length
      ? `${filteredEntries.length}件`
      : chatPaletteEntries.length ? '一致する項目がありません。' : 'パレットの項目がありません。';
  };

  const refreshChatState = async ({ force = true, includeCharacters = false } = {}) => {
    try {
      const chatState = await sendRequest('CCFOLIA_CHAT_GET_STATE', { force, includeCharacters });
      renderChatState(chatState);
    } catch (reason) {
      if (!latestChatState) chatStatus.textContent = reason instanceof Error ? reason.message : String(reason);
    }
  };

  acquireButton.addEventListener('click', async () => {
    acquireButton.disabled = true;
    status.textContent = 'キャラクター情報を取得しています…';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CCFOLIA_ACQUIRE_CHARACTERS' });
      if (!result?.ok) throw new Error(result?.error || 'キャラクター情報を取得できませんでした。');
      const previousCharacters = acquiredCharacters ?? [];
      acquiredCharacters = result.characters.map((character) => {
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
      status.textContent = `${acquiredCharacters.length}人のキャラクター情報を取得しました。`;
    } catch (reason) {
      console.error('[CCFOLIA ステータス変更]', reason);
      status.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      acquireButton.disabled = false;
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
  openChatPaletteButton.addEventListener('click', async () => {
    openChatPaletteButton.disabled = true;
    chatPaletteStatus.textContent = 'パレットを読み込んでいます…';
    chatPalettePanel.hidden = false;
    chatPaletteItems.replaceChildren();
    try {
      const result = await sendRequest('CCFOLIA_CHAT_PALETTE');
      chatPaletteEntries = result.entries ?? [];
      chatPaletteSearch.value = '';
      renderChatPalette();
      chatPaletteSearch.focus();
    } catch (reason) {
      chatStatus.textContent = reason.message;
      chatPalettePanel.hidden = true;
    } finally {
      openChatPaletteButton.disabled = false;
    }
  });
  closeChatPaletteButton.addEventListener('click', () => {
    chatPalettePanel.hidden = true;
  });
  chatPaletteSearch.addEventListener('input', renderChatPalette);
  clearMessageButton.addEventListener('click', () => {
    chatInput.value = '';
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    chatInput.focus();
  });
  sendButton.addEventListener('click', async () => {
    if (!chatInput.value.trim()) return;
    sendButton.disabled = true;
    try {
      const selectedTab = chatTabs.value;
      await sendRequest('CCFOLIA_CHAT_SEND', {
        text: chatInput.value,
        ...(selectedTab !== '' ? { tabIndex: Number(selectedTab) } : {})
      });
      chatInput.value = '';
      await refreshChatState();
    } catch (reason) {
      chatStatus.textContent = reason.message;
    } finally {
      sendButton.disabled = false;
      chatInput.focus();
    }
  });
  chatInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    sendButton.click();
  });
  speakerNameInput.addEventListener('change', async () => {
    try {
      await sendRequest('CCFOLIA_CHAT_SET_SPEAKER', { name: speakerNameInput.value });
    } catch (reason) {
      chatStatus.textContent = reason.message;
    }
  });
  characterChoice.addEventListener('change', async () => {
    const selected = characterChoice.selectedOptions[0];
    const name = selected?.dataset.characterName;
    const key = selected?.dataset.characterKey;
    if (!name && !key) return;
    try {
      await sendRequest('CCFOLIA_CHAT_SELECT_CHARACTER', { name, key });
      speakerNameInput.value = name;
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

  renderCharacterChoices();
  renderDiceControls();
  syncCommandMap();
  void refreshChatState({ force: true, includeCharacters: true });
  void syncAutoSkipStatus();
  window.setInterval(() => void refreshChatState({ force: false }), 10000);
  window.setInterval(() => void syncAutoSkipStatus(), 1000);
})();
