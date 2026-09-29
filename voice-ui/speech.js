const SpeechRecognitionAPI =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let recognizer = null;
let isListening = false;
let micPermission = "unknown";



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

    if (window.onSpeechStart) {
      window.onSpeechStart();
    }
  };

  recognizer.onresult = (event) => {
    const heardText =
      event.results[0][0].transcript;

    if (window.onSpeechResult) {
      window.onSpeechResult(heardText);
    }
  };

  recognizer.onerror = (event) => {

    if (
      event.error === "not-allowed" ||
      event.error === "service-not-allowed"
    ) {
      micPermission = "denied";
    }

    if (window.onSpeechError) {
      window.onSpeechError(
        event.error,
        micPermission
      );
    }
  };

  recognizer.onend = () => {
    isListening = false;

    if (window.onSpeechEnd) {
      window.onSpeechEnd();
    }
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
    if (window.onSpeechError) {
      window.onSpeechError(
        "not-allowed",
        "denied"
      );
    }

    return;
  }

  if (!recognizer) {

    if (window.onSpeechError) {
      window.onSpeechError(
        "not-supported",
        micPermission
      );
    }

    return;
  }

  if (isListening) {
    return;
  }

  try {
    recognizer.start();
  } catch (error) {
    // Prevent start() from crashing the application
    console.log("Speech start error:", error);
  }
}


function stopSpeechRecognition() {

  if (!recognizer) {
    return;
  }

  try {
    recognizer.stop();
  } catch (error) {
    // Already stopped
  }
}


function abortSpeechRecognition() {

  if (!recognizer) {
    return;
  }

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

