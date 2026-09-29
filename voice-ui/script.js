const panels = [
  document.getElementById('panel-idle'),
  document.getElementById('panel-listening'),
  document.getElementById('panel-verification'),
  document.getElementById('panel-result')
];

const ui = {
  listeningSub: document.getElementById('listeningSub'),
  verifyText: document.getElementById('verifyText'),
  resultCommand: document.getElementById('resultCommand'),
  micAvatar: document.getElementById('micAvatar'),
  chipGrid: document.getElementById('chipGrid'),
  cancelBtn: document.getElementById('cancelBtn'),
  retryBtn: document.getElementById('retryBtn'),
  continueBtn: document.getElementById('continueBtn')
};

const actions = {
  'Show my Aadhaar': 'Opening Aadhaar',
  'Search Driving Licence': 'Searching Driving Licence',
  'Go to Issued Documents': 'Opening Issued Documents',
  'Download my PAN card': 'Downloading PAN card',
  'Help': 'Opening Help'
};

let timer = null;
let lastHeardText = null;
const resultDisplayTime = 5000;

const showPanel = (panel) => {
  panels.forEach((item) => item && (item.hidden = item !== panel));
};

const matchCommand = (text) => {
  if (!text) return null;
  const query = text.toLowerCase();
  return Object.keys(actions).find((cmd) => {
    const command = cmd.toLowerCase();
    return query.includes(command) || command.includes(query);
  }) || null;
};

const showResult = (text) => {
  const match = matchCommand(text);
  ui.resultCommand.textContent = match
    ? actions[match]
    : text
      ? `Didn't recognize: "${text}"`
      : 'Command recognized';

  showPanel(document.getElementById('panel-result'));
  timer = setTimeout(() => showPanel(document.getElementById('panel-idle')), resultDisplayTime);
};

const startListening = (preset) => {
  clearTimeout(timer);

  if (preset) {
    ui.listeningSub.textContent = `Heard: "${preset}"`;
    showPanel(document.getElementById('panel-listening'));
    timer = setTimeout(() => {
      lastHeardText = preset;
      ui.verifyText.textContent = preset;
      showPanel(document.getElementById('panel-verification'));
    }, 700);
    return;
  }

  ui.listeningSub.textContent = 'Please say a command';
  showPanel(document.getElementById('panel-listening'));
  startSpeechRecognition();
};

const bindSpeechCallbacks = () => {
  window.onSpeechStart = () => {
    ui.listeningSub.textContent = 'Please say a command';
    showPanel(document.getElementById('panel-listening'));
  };

  window.onSpeechResult = (text) => {
    const transcript = (text || '').trim();
    if (!transcript) return;
    lastHeardText = transcript;
    ui.verifyText.textContent = transcript;
    showPanel(document.getElementById('panel-verification'));
  };

  window.onSpeechError = (error, permissionState) => {
    const isDenied = error === 'not-allowed' || error === 'service-not-allowed' || permissionState === 'denied';

    if (error === 'not-supported') {
      lastHeardText = 'Show my Aadhaar';
      ui.verifyText.textContent = lastHeardText;
      showPanel(document.getElementById('panel-verification'));
      return;
    }

    ui.listeningSub.textContent = isDenied ? 'Microphone access denied' : "Didn't catch that — tap to retry";
    timer = setTimeout(() => showPanel(document.getElementById('panel-idle')), 1800);
  };

  window.onSpeechEnd = () => {
    // no-op; UI state is handled by result/verification steps
  };
};

window.addEventListener('load', bindSpeechCallbacks);

if (ui.micAvatar) ui.micAvatar.addEventListener('click', () => startListening(null));
if (ui.chipGrid) ui.chipGrid.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  startListening(chip.dataset.command);
});

if (ui.cancelBtn) ui.cancelBtn.addEventListener('click', () => {
  clearTimeout(timer);
  stopSpeechRecognition();
  showPanel(document.getElementById('panel-idle'));
});

document.querySelectorAll('.close-btn').forEach((button) => {
  button.addEventListener('click', () => {
    clearTimeout(timer);
    stopSpeechRecognition();
    showPanel(document.getElementById('panel-idle'));
  });
});

if (ui.retryBtn) ui.retryBtn.addEventListener('click', () => startListening(null));
if (ui.continueBtn) ui.continueBtn.addEventListener('click', () => showResult(lastHeardText));