const firstRunTabs = new Set();

const isFirstRun = (tabId) => firstRunTabs.has(tabId);
const markRunComplete = (tabId) => firstRunTabs.delete(tabId);
const markFirstRun = (tabId) => firstRunTabs.add(tabId);

async function speakSelectedTextInTab(text) {
  const modal = getModal();
  modal.updateText('Synthesizing speech...');

  try {
    const embeddingsUrl =
      'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';

    const [result] = await browser.trial.ml.runEngine({
      args: [text],
      options: { speaker_embeddings: embeddingsUrl },
    });

    const audioBlob = new Blob([new Uint8Array(result.data)], {
      type: 'audio/wav',
    });
    const audioUrl = URL.createObjectURL(audioBlob);

    new Audio(audioUrl).play();
    modal.updateText('✅ Playing speech...');
  } catch (error) {
    modal.updateText(`❌ Error: ${error}`);
  }
}

async function prepareTab(tabId) {
  await browser.tabs.insertCSS(tabId, { file: './alt-text-modal.css' });
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['./content-script.js'],
  });

  // Ask content-script to show modal
  await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      const modal = window.getModal?.();
      modal?.updateText('Initializing...');
    },
  });

  await browser.trial.ml.createEngine({
    modelHub: 'huggingface',
    taskName: 'text-to-audio',
    modelId: 'Xenova/speecht5_tts',
    dtype: 'fp32',
  });
}

async function handleClick(info, tab) {
  const { selectionText: text } = info;
  if (!text) return;

  const tabId = tab.id;

  const progressListener = (progress) =>
    browser.tabs.sendMessage(tabId, progress);

  browser.trial.ml.onProgress.addListener(progressListener);

  try {
    if (!tabId) return;

    if (isFirstRun(tabId)) {
      await prepareTab(tabId);
    }

    await browser.scripting.executeScript({
      target: { tabId },
      func: speakSelectedTextInTab,
      args: [text],
    });
  } finally {
    browser.trial.ml.onProgress.removeListener(progressListener);
    markRunComplete(tabId);
  }
}

// MENU ITEM
browser.menus.create({
  id: 'test-speak',
  title: '🗣️ Debug: Speak Text',
  contexts: ['all'],
  onclick: handleClick,
});

//Permission check
browser.permissions.contains({ permissions: ['trialML'] }).then((granted) => {
  if (!granted)
    browser.tabs.create({ url: browser.runtime.getURL('settings.html') });
});

// Mark all tabs as first run initially
browser.tabs.query({}).then((tabs) => {
  tabs.forEach((tab) => {
    if (tab.id) markFirstRun(tab.id);
  });
});

console.log('🟢 Menu item registered');
