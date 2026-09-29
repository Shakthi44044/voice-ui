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
  continueBtn: document.getElementById('continueBtn'),
  closeButtons: [...document.querySelectorAll('.close-btn')]
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
let recognition = null;
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

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    timer = setTimeout(() => {
      lastHeardText = 'Show my Aadhaar';
      ui.verifyText.textContent = lastHeardText;
      showPanel(document.getElementById('panel-verification'));
    }, 1800);
    return;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      lastHeardText = text;
      ui.verifyText.textContent = text;
      showPanel(document.getElementById('panel-verification'));
    };
    recognition.onerror = (event) => {
      ui.listeningSub.textContent = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Microphone access denied'
        : "Didn't catch that  tap to retry";
      timer = setTimeout(() => showPanel(document.getElementById('panel-idle')), 1800);
    };
  }

  try { recognition.start(); } catch {}
};

if (ui.micAvatar) ui.micAvatar.addEventListener('click', () => startListening(null));
if (ui.chipGrid) ui.chipGrid.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  startListening(chip.dataset.command);
});

if (ui.cancelBtn) ui.cancelBtn.addEventListener('click', () => {
  clearTimeout(timer);
  if (recognition) recognition.stop();
  showPanel(document.getElementById('panel-idle'));
});

document.querySelectorAll('.close-btn').forEach((button) => {
  button.addEventListener('click', () => {
    clearTimeout(timer);
    if (recognition) recognition.stop();
    showPanel(document.getElementById('panel-idle'));
  });
});

if (ui.retryBtn) ui.retryBtn.addEventListener('click', () => startListening(null));
if (ui.continueBtn) ui.continueBtn.addEventListener('click', () => showResult(lastHeardText));