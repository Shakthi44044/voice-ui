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

const keywords = {
  'Show my Aadhaar':        ['aadhaar', 'aadhar', 'adhar'],
  'Search Driving Licence': ['driving', 'licence', 'license'],
  'Go to Issued Documents': ['issued', 'documents'],
  'Download my PAN card':   ['pan'],
  'Help':                   ['help']
};

const matchCommand = (text) => {
  if (!text) return null;
  const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/);
  return Object.keys(keywords).find((cmd) => keywords[cmd].some((k) => words.includes(k))) || null;
};

const showResult = (text) => {
  const panel = document.getElementById('panel-result');
  const match = matchCommand(text);
  panel.classList.toggle('is-error', !match);
  ui.resultCommand.textContent = match
    ? actions[match].replace(' ', '\n')
    : "Sorry, I didn't\nrecognise that";
  showPanel(panel);
  clearTimeout(timer);
  timer = setTimeout(() => showPanel(document.getElementById('panel-idle')), resultDisplayTime);
};

const buildWaveform = () => {
  const wf = document.querySelector('.waveform');
  if (!wf) return;
  wf.innerHTML = '';
  for (let i = 0; i < 44; i++) {
    const bar = document.createElement('span');
    bar.className = 'wave-bar';
    bar.style.height = (10 + Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21)) * 38) + 'px';
    bar.style.setProperty('--delay', (i * 0.05) + 's');
    wf.appendChild(bar);
  }
};
buildWaveform();

const goIdle = () => {
  clearTimeout(timer);
  showPanel(document.getElementById('panel-idle'));
};

const showListening = (message = 'Please say a command') => {
  clearTimeout(timer);
  ui.listeningSub.textContent = message;
  showPanel(document.getElementById('panel-listening'));
};
const setTranscript = (text) => {
  let transcript = (text || '').trim();
  while (/[.!?,]/.test(transcript.slice(-1))) transcript = transcript.slice(0, -1);
  if (!transcript) return;
  clearTimeout(timer);
  lastHeardText = transcript;
  ui.verifyText.textContent = transcript;
  showPanel(document.getElementById('panel-verification'));
};

const showVoiceError = (message = "Didn't catch that — tap to retry") => {
  clearTimeout(timer);
  ui.listeningSub.textContent = message;
  showPanel(document.getElementById('panel-listening'));
  timer = setTimeout(goIdle, 1800);
};

window.voiceUI = { showListening, setTranscript, showVoiceError, showResult, goIdle };


const startListening = (preset) => {
  clearTimeout(timer);
  if (preset) {
    showListening('Heard: "' + preset + '"');
    timer = setTimeout(() => setTranscript(preset), 700);
    return;
  }

  showListening();
  if (typeof window.onVoiceStart === 'function') window.onVoiceStart();
};

const cancelListening = () => {
  goIdle();
  if (typeof window.onVoiceCancel === 'function') window.onVoiceCancel();
};

if (ui.micAvatar) ui.micAvatar.addEventListener('click', () => startListening(null));
if (ui.chipGrid) ui.chipGrid.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  startListening(chip.dataset.command);
});

if (ui.cancelBtn) ui.cancelBtn.addEventListener('click', cancelListening);
document.querySelectorAll('.close-btn').forEach((button) => button.addEventListener('click', cancelListening));

if (ui.retryBtn) ui.retryBtn.addEventListener('click', () => startListening(null));
if (ui.continueBtn) ui.continueBtn.addEventListener('click', () => {
  if (typeof window.onVoiceConfirm === 'function') window.onVoiceConfirm(lastHeardText);
  showResult(lastHeardText);
});