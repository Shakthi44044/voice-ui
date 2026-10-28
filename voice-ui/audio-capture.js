(function () {
  const config = {
    noSpeechTimeoutMs: 5000,     
    silenceAfterSpeechMs: 2000, 
    maxDurationMs: 30000,        
    speechThreshold: 0.001,      
    sustainFactor: 0.6,          
    noiseMultiplier: 3,          
    maxNoiseFloor: 0.01,       
    warmupMs: 250,              
    calibrationMs: 300,       
    minSpeechMs: 300,            
    checkIntervalMs: 50,
    wavSampleRate: 16000,
    debug: false               
  };
  const aacMimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/aac'
  ];
  let session = null;
  const getAacMimeType = () => {
    if (!window.MediaRecorder) return null;
    return aacMimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || null;
  };
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    const step = 0x2000; 
    let binary = '';
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(binary);
  };
  const blobToWavBuffer = async (blob) => {
    const rate = config.wavSampleRate;
    const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
    let decoded;
    try {
      decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
    } finally {
      decodeCtx.close().catch(() => {});
    }
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const pcm = (await offline.startRendering()).getChannelData(0);
    const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);          
    view.setUint16(20, 1, true);          
    view.setUint16(22, 1, true);          
    view.setUint32(24, rate, true);       
    view.setUint32(28, rate * 2, true);   
    view.setUint16(32, 2, true);          
    view.setUint16(34, 16, true);         
    writeStr(36, 'data');
    view.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return view.buffer;
  };
  const finish = (s, reason) => {
    if (!s || s.finished) return;
    s.finished = true;
    s.reason = reason;
    clearInterval(s.vadTimer);
    clearTimeout(s.maxTimer);
    if (s.recorder.state !== 'inactive') s.recorder.stop(); 
    else s.cleanup();
  };
  const stop = () => finish(session, 'manual');
  const start = async ({ onError, onNoSpeech, onData } = {}) => {
    stop(); 

    if (!window.isSecureContext) {
      onError && onError('Microphone needs https:// or localhost');
      return false;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onError && onError('Microphone access is not supported by this browser');
      return false;
    }
    const mimeType = getAacMimeType();
    if (!mimeType) {
      onError && onError('AAC audio is not supported by this browser');
      return false;
    }
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false 
        }
      });
    } catch (error) {
      console.error('Unable to start microphone capture:', error);
      audioCtx.close().catch(() => {});
      onError && onError(error.name === 'NotAllowedError'
        ? 'Microphone permission is required'
        : 'Unable to access the microphone');
      return false;
    }
    try {
      await audioCtx.resume();
    } catch (error) {
      console.error('Unable to start audio analysis:', error);
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
      onError && onError('Unable to start audio analysis');
      return false;
    }
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    const keepAlive = audioCtx.createGain();
    keepAlive.gain.value = 0;
    analyser.connect(keepAlive);
    keepAlive.connect(audioCtx.destination);
    const samples = new Float32Array(analyser.fftSize);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    const s = {
      recorder, source, keepAlive, finished: false, reason: null,
      speechDetected: false, startedAt: Date.now(), lastSpeechAt: 0,
      noiseSum: 0, noiseCount: 0, noiseFloor: 0,
      voicedMs: 0, lastVoicedAt: 0, ticks: 0,
      vadTimer: null, maxTimer: null,
      cleanup: () => {
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close().catch(() => {});
        if (session === s) session = null;
      }
    };
    session = s;
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size) chunks.push(e.data);
    });

    recorder.addEventListener('error', (e) => {
      console.error('Audio capture failed:', e.error || e);
      onError && onError('Unable to capture audio');
      finish(s, 'error');
    });
    recorder.addEventListener('stop', async () => {
      s.cleanup();
      if (s.reason === 'manual' || s.reason === 'error') return;
      if (!s.speechDetected) {
        onNoSpeech && onNoSpeech();
        return;
      }
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const wavBuffer = await blobToWavBuffer(blob);       
        const audioBase64 = arrayBufferToBase64(wavBuffer); 
        const payload = {
          audioBase64,
          mimeType: 'audio/wav',
          sampleRate: config.wavSampleRate,
          durationMs: Date.now() - s.startedAt
        };
        console.log(audioBase64)
        onData && onData(payload);
        if (typeof window.onVoiceData === 'function') window.onVoiceData(payload);
      } catch (error) {
        console.error('Unable to encode audio as WAV/Base64:', error);
        onError && onError('Unable to process audio');
      }
    });
    s.vadTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);
      const now = Date.now();
      const elapsed = now - s.startedAt;
      if (elapsed < config.warmupMs) return;
      if (elapsed < config.warmupMs + config.calibrationMs) {
        s.noiseSum += rms;
        s.noiseCount++;
        s.noiseFloor = Math.min(s.noiseSum / s.noiseCount, config.maxNoiseFloor);
        return;
      }
      const startThreshold = Math.max(config.speechThreshold, s.noiseFloor * config.noiseMultiplier);
      const threshold = s.speechDetected ? startThreshold * config.sustainFactor : startThreshold;
      if (config.debug && ++s.ticks % 10 === 0) {
        console.log('rms', rms.toFixed(4), 'thr', threshold.toFixed(4), 'speech', s.speechDetected);
      }
      if (rms > threshold) {
        if (!s.speechDetected) {
          if (now - s.lastVoicedAt > 300) s.voicedMs = 0;
          s.voicedMs += config.checkIntervalMs;
          if (s.voicedMs >= config.minSpeechMs) {
            s.speechDetected = true;
            s.lastSpeechAt = now;
          }
        } else {
          s.lastSpeechAt = now; 
        }
        s.lastVoicedAt = now;
      }

      if (!s.speechDetected && elapsed > config.noSpeechTimeoutMs) {
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