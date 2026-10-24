(() => {
  'use strict';

  const LOG_PREFIX = '[CCFOLIA ステータス変更]';
  const ROOM_URL_PATTERN = 'https://ccfolia.com/rooms/*';
  const log = (...args) => console.info(LOG_PREFIX, ...args);
  const error = (...args) => console.error(LOG_PREFIX, ...args);
  let commandMapWrite = Promise.resolve();

  // 拡張機能アイコンから、サイト内ではなく専用の制御ウィンドウを開きます。
  chrome.action.onClicked.addListener(async () => {
    try {
      await chrome.windows.create({
        url: chrome.runtime.getURL('control.html'),
        type: 'popup',
        width: 380,
        height: 720,
        focused: true
      });
    } catch (reason) {
      error('制御ウィンドウを開けませんでした。', reason);
    }
  });

  const findRoomTab = async () => {
    const tabs = await chrome.tabs.query({ url: ROOM_URL_PATTERN });
    const tab = tabs.find((candidate) => candidate.status === 'complete') ?? tabs[0];
    if (!tab?.id) throw new Error('CCFOLIAのルームタブが見つかりません。先にルームを開いてください。');
    return tab;
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'CCFOLIA_SAVE_COMMAND_MAP') {
      commandMapWrite = commandMapWrite.catch(() => {}).then(() => chrome.storage.local.set({ ccfoliaCommandMap: message.commandMap ?? {} }));
      commandMapWrite
        .then(() => sendResponse({ ok: true }))
        .catch((reason) => sendResponse({ ok: false, error: String(reason) }));
      return true;
    }
    if (message?.type === 'CCFOLIA_GET_COMMAND_MAP') {
      commandMapWrite.then(() => chrome.storage.local.get('ccfoliaCommandMap'))
        .then((stored) => sendResponse({ ok: true, commandMap: stored.ccfoliaCommandMap ?? {} }))
        .catch((reason) => sendResponse({ ok: false, error: String(reason) }));
      return true;
    }
    if (!['CCFOLIA_APPLY_STATUS', 'CCFOLIA_ACQUIRE_CHARACTERS'].includes(message?.type)) return undefined;

    (async () => {
      try {
        // 制御ウィンドウ自身ではなく、URLでCCFOLIAルームを明示的に探します。
        const roomTab = await findRoomTab();
        log('操作対象タブ:', roomTab.id, roomTab.url);
        const result = await chrome.tabs.sendMessage(roomTab.id, {
          type: message.type === 'CCFOLIA_ACQUIRE_CHARACTERS'
            ? 'CCFOLIA_ACQUIRE_CHARACTERS_IN_ROOM'
            : 'CCFOLIA_APPLY_STATUS_IN_ROOM',
          metricKey: message.metricKey,
          operation: message.operation,
          amount: message.amount,
          characterIds: message.characterIds
        });
        sendResponse(result);
      } catch (reason) {
        const messageText = reason instanceof Error ? reason.message : String(reason);
        error(messageText);
        sendResponse({ ok: false, error: messageText });
      }
    })();
    return true;
  });
})();
