const SpeechRecognitionAPI =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let recognizer = null;
let isListening = false;
let micPermission = "unknown";

window.onSpeechStart = window.onSpeechStart || (() => {});
window.onSpeechResult = window.onSpeechResult || (() => {});
window.onSpeechError = window.onSpeechError || (() => {});
window.onSpeechEnd = window.onSpeechEnd || (() => {});

if (navigator.permissions && navigator.permissions.query) {
  navigator.permissions
    .query({ name: "microphone" })
    .then((status) => {
      micPermission = status.state;

      status.onchange = () => {
        micPermission = status.state;
      };
    })
    .catch(() => {
      // Permission API not supported
    });
}

if (SpeechRecognitionAPI) {
  recognizer = new SpeechRecognitionAPI();

  recognizer.lang = "en-IN";
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;

  recognizer.onstart = () => {
    isListening = true;
    window.onSpeechStart();
  };

  recognizer.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    if (transcript) {
      window.onSpeechResult(transcript.trim());
    }
  };

  recognizer.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      micPermission = "denied";
    }

    window.onSpeechError(event.error, micPermission);
  };

  recognizer.onend = () => {
    isListening = false;
    window.onSpeechEnd();
  };

  recognizer.onspeechend = () => {
    try {
      recognizer.stop();
    } catch (error) {
      // Already stopped
    }
  };
}

function startSpeechRecognition() {
  if (micPermission === "denied") {
    window.onSpeechError("not-allowed", "denied");
    return;
  }

  if (!recognizer) {
    window.onSpeechError("not-supported", micPermission);
    return;
  }

  if (isListening) {
    return;
  }

  try {
    recognizer.start();
  } catch (error) {
    console.log("Speech start error:", error);
  }
}

function stopSpeechRecognition() {
  if (!recognizer) return;

  try {
    recognizer.stop();
  } catch (error) {
    // Already stopped
  }
}

function abortSpeechRecognition() {
  if (!recognizer) return;

  try {
    recognizer.abort();
  } catch (error) {
    // Already stopped
  }

  isListening = false;
}

function getMicPermission() {
  return micPermission;
}

function isSpeechSupported() {
  return recognizer !== null;
}
