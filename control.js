(() => {
  'use strict';

  const metricOptions = document.getElementById('metric-options');
  const operationOptions = document.getElementById('operation-options');
  const amountInput = document.getElementById('amount');
  const amountLabel = document.getElementById('amount-label');
  const amountOptions = document.getElementById('amount-options');
  const acquireButton = document.getElementById('acquire');
  const characterModeOptions = document.getElementById('character-mode-options');
  const charactersElement = document.getElementById('characters');
  const commandsInput = document.getElementById('commands');
  const executeCommandsButton = document.getElementById('execute-commands');
  const runButton = document.getElementById('run');
  const status = document.getElementById('status');
  const CHARACTER_STORAGE_KEY = 'ccfolia-status-characters-v1';
  const readStoredCharacters = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(CHARACTER_STORAGE_KEY) || 'null');
      return Array.isArray(stored) ? stored : null;
    } catch {
      return null;
    }
  };
  let acquiredCharacters = readStoredCharacters();
  let metricKey = 'hp';
  let operation = 'decrease';
  let characterMode = 'multiple';

  const syncCommandMap = () => {
    const commandMap = Object.fromEntries((acquiredCharacters ?? [])
      .filter((character) => Number.isInteger(Number(character.commandNumber)) && Number(character.commandNumber) >= 1 && Number(character.commandNumber) <= 16)
      .map((character) => [String(character.commandNumber), character.id]));
    chrome.runtime.sendMessage({ type: 'CCFOLIA_SAVE_COMMAND_MAP', commandMap }).catch((reason) => {
      console.error('[CCFOLIA ステータス変更] 番号設定を同期できませんでした。', reason);
    });
  };

  const setCharacterSelected = (button, selected) => {
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-selected', selected);
  };

  const renderCharacterChoices = () => {
    const selectedIds = new Set([...charactersElement.querySelectorAll('.character-choice[aria-pressed="true"]')]
      .map((button) => button.dataset.characterId));
    const hadSelection = selectedIds.size > 0;
    charactersElement.replaceChildren();
    const assignedNumbers = new Set((acquiredCharacters ?? []).map((character) => Number(character.commandNumber)).filter((number) => Number.isInteger(number) && number >= 1 && number <= 16));
    for (const character of acquiredCharacters ?? []) {
      const row = document.createElement('div');
      row.className = 'character-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'character-choice';
      button.dataset.characterId = character.id;
      const selected = hadSelection
        ? selectedIds.has(character.id)
        : characterMode === 'multiple' || charactersElement.childElementCount === 0;
      setCharacterSelected(button, selected);
      button.textContent = character.name;
      const numberSelect = document.createElement('select');
      numberSelect.className = 'character-number';
      numberSelect.setAttribute('aria-label', `${character.name}の番号`);
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '番号';
      numberSelect.append(empty);
      for (let number = 1; number <= 16; number += 1) {
        const option = document.createElement('option');
        option.value = String(number);
        option.textContent = String(number);
        option.disabled = assignedNumbers.has(number) && Number(character.commandNumber) !== number;
        numberSelect.append(option);
      }
      numberSelect.value = character.commandNumber ? String(character.commandNumber) : '';
      row.append(button, numberSelect);
      charactersElement.append(row);
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
        const previous = previousCharacters.find((item) => item.name === character.name)
          ?? previousCharacters.find((item) => item.id === character.id);
        return previous?.commandNumber ? { ...character, commandNumber: previous.commandNumber } : character;
      });
      localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(acquiredCharacters));
      syncCommandMap();
      renderCharacterChoices();
      status.textContent = `${acquiredCharacters.length}人のキャラクター名を取得しました。対象を選択してください。`;
    } catch (reason) {
      console.error('[CCFOLIA ステータス変更]', reason);
      status.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      acquireButton.disabled = false;
    }
  });

  charactersElement.addEventListener('click', (event) => {
    const button = event.target.closest('.character-choice');
    if (!button) return;
    if (characterMode === 'single') {
      for (const choice of charactersElement.querySelectorAll('.character-choice')) {
        setCharacterSelected(choice, choice === button);
      }
      return;
    }
    setCharacterSelected(button, button.getAttribute('aria-pressed') !== 'true');
  });

  charactersElement.addEventListener('change', (event) => {
    const select = event.target.closest('.character-number');
    if (!select) return;
    const row = select.closest('.character-row');
    const characterId = row?.querySelector('.character-choice')?.dataset.characterId;
    const character = acquiredCharacters?.find((item) => item.id === characterId);
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

  executeCommandsButton.addEventListener('click', async () => {
    if (!acquiredCharacters?.length) {
      status.textContent = '先にキャラクター情報を取得し、各キャラクターへ番号を割り当ててください。';
      return;
    }
    const numberToCharacter = new Map(acquiredCharacters
      .filter((character) => Number.isInteger(Number(character.commandNumber)) && Number(character.commandNumber) >= 1 && Number(character.commandNumber) <= 16)
      .map((character) => [String(character.commandNumber), character.id]));
    const lines = commandsInput.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      status.textContent = 'コマンドを1行以上入力してください。';
      return;
    }
    const commands = [];
    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(/^(\d+(?:(?:\s*,\s*|\s+)\d+)*)\s*(hp|mp|san|h|m|s)(\s*)([+-]?\d+)(?:\s+.*)?$/i);
      if (!match) {
        status.textContent = `${index + 1}行目の形式が不正です。例: 1h10 (増加) または 1h 10 (減少)`;
        return;
      }
      const numbers = [...new Set(match[1].trim().split(/[\s,]+/))];
      const characterIds = [];
      for (const number of numbers) {
        const characterId = numberToCharacter.get(number);
        if (!characterId) {
          status.textContent = `番号${number}のキャラクターが見つかりません。1〜16の番号を割り当ててください。`;
          return;
        }
        characterIds.push(characterId);
      }
      const amountText = match[4];
      const rawAmount = Number(amountText);
      const signedAmount = amountText.startsWith('-')
        ? rawAmount
        : amountText.startsWith('+')
          ? rawAmount
          : match[3].length > 0 ? -rawAmount : rawAmount;
      if (signedAmount === 0 || Math.abs(signedAmount) > 999999) {
        status.textContent = `${index + 1}行目の変更量は1〜999999で指定してください。`;
        return;
      }
      commands.push({
        metricKey: ({ hp: 'hp', h: 'hp', mp: 'mp', m: 'mp', san: 'san', s: 'san' })[match[2].toLowerCase()],
        operation: signedAmount < 0 ? 'decrease' : 'increase',
        amount: Math.abs(signedAmount),
        characterIds
      });
    }

    executeCommandsButton.disabled = true;
    try {
      for (let index = 0; index < commands.length; index += 1) {
        status.textContent = `${index + 1}/${commands.length}件のコマンドを実行しています…`;
        const result = await chrome.runtime.sendMessage({ type: 'CCFOLIA_APPLY_STATUS', ...commands[index] });
        if (!result?.ok) throw new Error(result?.error || `${index + 1}行目のコマンドに失敗しました。`);
      }
      status.textContent = `${commands.length}件のチャットコマンドを実行しました。`;
    } catch (reason) {
      console.error('[CCFOLIA ステータス変更]', reason);
      status.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      executeCommandsButton.disabled = false;
    }
  });

  commandsInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!executeCommandsButton.disabled) executeCommandsButton.click();
  });

  characterModeOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.choice-button');
    if (!button) return;
    characterMode = button.dataset.mode;
    for (const choice of characterModeOptions.querySelectorAll('.choice-button')) {
      const selected = choice === button;
      choice.classList.toggle('is-selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
    }
    if (characterMode === 'single') {
      const choices = [...charactersElement.querySelectorAll('.character-choice')];
      const firstSelected = choices.find((choice) => choice.getAttribute('aria-pressed') === 'true') ?? choices[0];
      for (const choice of choices) setCharacterSelected(choice, choice === firstSelected);
    }
  });

  const selectButton = (group, value) => {
    for (const button of group.querySelectorAll('.choice-button')) {
      const selected = button.dataset.value === value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };

  const updateAmountLabel = () => {
    amountLabel.textContent = operation === 'set' ? '設定値' : '変更量';
    amountInput.min = operation === 'set' ? '0' : '1';
  };
  const selectAmount = (value) => {
    for (const button of amountOptions.querySelectorAll('.amount-choice')) {
      const selected = Number(button.dataset.value) === value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  };
  amountOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.amount-choice');
    if (!button) return;
    amountInput.value = button.dataset.value;
    selectAmount(Number(button.dataset.value));
  });
  amountInput.addEventListener('input', () => {
    const amount = Number(amountInput.value);
    selectAmount(amountInput.value === '' ? NaN : amount);
  });
  metricOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.choice-button');
    if (!button) return;
    metricKey = button.dataset.value;
    selectButton(metricOptions, metricKey);
  });
  operationOptions.addEventListener('click', (event) => {
    const button = event.target.closest('.choice-button');
    if (!button) return;
    operation = button.dataset.value;
    selectButton(operationOptions, operation);
    updateAmountLabel();
  });
  updateAmountLabel();
  renderCharacterChoices();

  runButton.addEventListener('click', async () => {
    const amount = Number(amountInput.value);
    const minimum = operation === 'set' ? 0 : 1;
    if (!Number.isInteger(amount) || amount < minimum || amount > 999999) {
      status.textContent = operation === 'set'
        ? '設定値は0以上の整数で入力してください。'
        : '変更量は1以上の整数で入力してください。';
      return;
    }
    runButton.disabled = true;
    status.textContent = 'CCFOLIAルームを操作しています…';
    try {
      const characterIds = acquiredCharacters
        ? [...charactersElement.querySelectorAll('.character-choice[aria-pressed="true"]')].map((button) => button.dataset.characterId)
        : undefined;
      if (acquiredCharacters && characterIds.length === 0) throw new Error('操作するキャラクターを1人以上選択してください。');
      const result = await chrome.runtime.sendMessage({
        type: 'CCFOLIA_APPLY_STATUS',
        metricKey,
        operation,
        amount,
        characterIds
      });
      if (!result?.ok) throw new Error(result?.error || '操作に失敗しました。');
      const action = operation === 'set' ? `${amount}に設定` : `${amount}ずつ${operation === 'increase' ? '増加' : '減少'}`;
      const limitNotice = result.limitedCount > 0 ? ` 上下限により${result.limitedCount}人分を制限しました。` : '';
      status.textContent = `${result.count}人の${result.metric}を${action}しました。${limitNotice}`;
    } catch (reason) {
      console.error('[CCFOLIA ステータス変更]', reason);
      status.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      runButton.disabled = false;
    }
  });

  syncCommandMap();
})();
