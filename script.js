const panelIdle = document.getElementById('panel-idle');
const panelListening = document.getElementById('panel-listening');
const panelResult = document.getElementById('panel-result');
const listeningSub = document.getElementById('listeningSub');
const resultCommand = document.getElementById('resultCommand');

const actionLabels = {
  "Show my Aadhaar": "Opening Aadhaar",
  "Search Driving Licence": "Searching Driving Licence",
  "Go to Issued Documents": "Opening Issued Documents",
  "Download my PAN card": "Downloading PAN card",
  "Help": "Opening Help"
};

let pendingTimer = null;

function showPanel(panel){
  [panelIdle, panelListening, panelResult].forEach(p => p.hidden = true);
  panel.hidden = false;
}

function finishRecognition(heardText){
  const matched = matchCommand(heardText);
  resultCommand.textContent = matched ? actionLabels[matched]
    : (heardText ? `Didn't recognize: "${heardText}"` : 'Command recognized');
  showPanel(panelResult);
  pendingTimer = setTimeout(() => showPanel(panelIdle), 1600);
}

// Matches free-form speech against the known command list.
function matchCommand(text){
  if (!text) return null;
  const lower = text.toLowerCase();
  return Object.keys(actionLabels).find(cmd => {
    const key = cmd.toLowerCase();
    return lower.includes(key) || key.includes(lower);
  }) || null;
}

// ---- Web Speech API setup ----
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isListening = false;
let micPermission = 'unknown'; // 'granted' | 'denied' | 'prompt' | 'unknown'

// Check current mic permission without ever triggering a prompt ourselves —
// only recognizer.start() should ever do that, and only once per grant.
if (navigator.permissions && navigator.permissions.query) {
  navigator.permissions.query({ name: 'microphone' })
    .then((status) => {
      micPermission = status.state;
      status.onchange = () => { micPermission = status.state; };
    })
    .catch(() => { /* not supported in this browser — fine, we just won't pre-check */ });
}

if (SpeechRecognitionAPI) {
  recognizer = new SpeechRecognitionAPI();
  recognizer.lang = 'en-IN';
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;

  recognizer.onresult = (event) => {
    const heard = event.results[0][0].transcript;
    finishRecognition(heard);
  };
  recognizer.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      micPermission = 'denied';
    }
    listeningSub.textContent = micPermission === 'denied'
      ? 'Microphone access denied'
      : "Didn't catch that — tap to retry";
    pendingTimer = setTimeout(() => showPanel(panelIdle), 1800);
  };
  recognizer.onstart = () => { isListening = true; };
  recognizer.onend = () => { isListening = false; };
  recognizer.onspeechend = () => recognizer.stop();
}

function startListening(command){
  clearTimeout(pendingTimer);

  // Chip tap = simulated shortcut, no real audio involved.
  if (command){
    listeningSub.textContent = `Heard: "${command}"`;
    showPanel(panelListening);
    pendingTimer = setTimeout(() => finishRecognition(command), 700);
    return;
  }

  // Already blocked — don't call start() again, that just re-triggers the
  // same denied prompt/error loop in some browsers.
  if (micPermission === 'denied') {
    listeningSub.textContent = 'Mic blocked — allow it in your browser\'s site settings';
    showPanel(panelListening);
    pendingTimer = setTimeout(() => showPanel(panelIdle), 2200);
    return;
  }

  // A session is already active — never call start() twice, that's what
  // causes some browsers to throw and re-prompt.
  if (recognizer && isListening) return;

  listeningSub.textContent = 'Please say a command';
  showPanel(panelListening);

  if (recognizer){
    try {
      recognizer.start();
    } catch (err) {
      // start() throws if called while already running — ignore, isListening guards this anyway
    }
  } else {
    // No browser support — fall back to the simulated demo flow.
    pendingTimer = setTimeout(() => finishRecognition(null), 2200);
  }
}

document.getElementById('micAvatar').addEventListener('click', () => startListening(null));

document.getElementById('chipGrid').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  startListening(chip.dataset.command);
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  clearTimeout(pendingTimer);
  if (recognizer) { try { recognizer.stop(); } catch (err) {} }
  showPanel(panelIdle);
});

[document.getElementById('closeIdle'), document.getElementById('closeListening'), document.getElementById('closeResult')]
  .forEach(btn => btn.addEventListener('click', () => {
    clearTimeout(pendingTimer);
    if (recognizer) { try { recognizer.stop(); } catch (err) {} }
    showPanel(panelIdle);
  }));
