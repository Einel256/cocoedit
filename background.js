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
        width: 420,
        height: 820,
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
    const forwardedTypes = new Set([
      'CCFOLIA_ACQUIRE_CHARACTERS',
      'CCFOLIA_CHAT_GET_STATE',
      'CCFOLIA_CHAT_SEND',
      'CCFOLIA_CHAT_SELECT_TAB',
      'CCFOLIA_CHAT_SET_SPEAKER',
      'CCFOLIA_CHAT_SELECT_CHARACTER',
      'CCFOLIA_CHAT_DICE',
      'CCFOLIA_CHAT_PALETTE',
      'CCFOLIA_AUTO_SKIP_MODE',
      'CCFOLIA_AUTO_SKIP_STATUS'
    ]);
    if (!forwardedTypes.has(message?.type)) return undefined;

    (async () => {
      try {
        // 制御ウィンドウ自身ではなく、URLでCCFOLIAルームを明示的に探します。
        const roomTab = await findRoomTab();
        log('操作対象タブ:', roomTab.id, roomTab.url);
        const { type, ...payload } = message;
        const result = await chrome.tabs.sendMessage(roomTab.id, {
          ...payload,
          type: `${type}_IN_ROOM`
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
