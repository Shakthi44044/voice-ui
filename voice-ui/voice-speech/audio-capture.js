(function () {
  const config = {
    noSpeechTimeoutMs: 5000,    
    silenceAfterSpeechMs: 1200, 
    maxDurationMs: 30000,       
    speechThreshold: 0.01,      
    noiseMultiplier: 3,         
    calibrationMs: 300,      
    minSpeechMs: 300,           
    checkIntervalMs: 50
  };

  const aacMimeTypes = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac'];
  let session = null;

  const getAacMimeType = () => {
    if (!window.MediaRecorder) return null;
    return aacMimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || null;
  };

  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    const step = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return btoa(binary);
  };

  const finish = (s, reason) => {
    if (!s || s.finished) return;
    s.finished = true;
    s.reason = reason;
    clearInterval(s.vadTimer);
    clearTimeout(s.maxTimer);
    if (s.recorder.state !== 'inactive') s.recorder.stop(); // triggers the 'stop' handler
    else s.cleanup();
  };

  // Cancels the current session without emitting any audio
  const stop = () => finish(session, 'manual');

  const start = async ({ onError, onNoSpeech, onData } = {}) => {
    stop(); // never run two sessions at once

    const mimeType = getAacMimeType();
    if (!mimeType) {
      onError && onError('AAC audio is not supported by this browser');
      return false;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onError && onError('Microphone access is not supported by this browser');
      return false;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.error('Unable to start microphone capture:', error);
      onError && onError(error.name === 'NotAllowedError'
        ? 'Microphone permission is required'
        : 'Unable to access the microphone');
      return false;
    }

    // Audio analysis for speech detection
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];

    const s = {
      recorder, finished: false, reason: null,
      speechDetected: false, startedAt: Date.now(), lastSpeechAt: 0,
      noiseSum: 0, noiseCount: 0, noiseFloor: 0,
      voicedMs: 0, lastVoicedAt: 0,
      vadTimer: null, maxTimer: null,
      cleanup: () => {
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close().catch(() => {});
        if (session === s) session = null;
      }
    };
    session = s;

    // Collect chunks silently, do NOT log them
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size) chunks.push(e.data);
    });

    recorder.addEventListener('error', (e) => {
      console.error('Audio capture failed:', e.error || e);
      onError && onError('Unable to capture audio');
      finish(s, 'error');
    });

    // Fires after the final dataavailable, so chunks is complete here
    recorder.addEventListener('stop', async () => {
      s.cleanup();
      if (s.reason === 'manual' || s.reason === 'error') return; // cancelled: emit nothing
      if (!s.speechDetected) {
        onNoSpeech && onNoSpeech();
        return;
      }
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const audioBase64 = arrayBufferToBase64(await blob.arrayBuffer());
        console.log(audioBase64); // printed once, after the user stops speaking
        const payload = { audioBase64, mimeType, durationMs: Date.now() - s.startedAt };
        onData && onData(payload);
        if (typeof window.onVoiceData === 'function') window.onVoiceData(payload);
      } catch (error) {
        console.error('Unable to encode audio as Base64:', error);
        onError && onError('Unable to process audio');
      }
    });

    // Voice activity detection loop
    s.vadTimer = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = (samples[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / samples.length);
      const now = Date.now();

      // 1) Calibrate: measure background noise for the first moments
      if (now - s.startedAt < config.calibrationMs) {
        s.noiseSum += rms;
        s.noiseCount++;
        s.noiseFloor = s.noiseSum / s.noiseCount;
        return;
      }

      // 2) A frame counts as voiced only if it is clearly above both limits
      const threshold = Math.max(config.speechThreshold, s.noiseFloor * config.noiseMultiplier);
      if (rms > threshold) {
        // restart the count if the last loud frame was too long ago (isolated noise)
        if (!s.speechDetected && now - s.lastVoicedAt > 300) s.voicedMs = 0;
        s.voicedMs += config.checkIntervalMs;
        s.lastVoicedAt = now;
        // 3) Confirm speech only after enough sustained loud audio
        if (s.voicedMs >= config.minSpeechMs) s.speechDetected = true;
        if (s.speechDetected) s.lastSpeechAt = now;
      }

      if (!s.speechDetected && now - s.startedAt > config.noSpeechTimeoutMs) {
        finish(s, 'no-speech');
      } else if (s.speechDetected && now - s.lastSpeechAt > config.silenceAfterSpeechMs) {
        finish(s, 'speech-ended');
      }
    }, config.checkIntervalMs);

    s.maxTimer = setTimeout(() => finish(s, 'max-duration'), config.maxDurationMs);

    recorder.start(300);
    return true;
  };

  window.voiceSpeech = { start, stop, config };
})();