// Simple state tracking
let mlEngineInitialized = false;

async function speakText(text) {
  console.log(
    `🔊 Speaking text: "${text.substring(0, 50)}${
      text.length > 50 ? '...' : ''
    }"'`
  );

  try {
    // Initialize ML engine if needed
    if (!mlEngineInitialized) {
      await initializeEngine();
    }

    console.log('🔄 Running TTS engine...');
    const embeddingsUrl =
      'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';

    console.log('🔄 Calling ML engine...');
    const success = await safelyProcessAudio(text, embeddingsUrl);
    return success;
  } catch (error) {
    console.error('❌ Error in speakText:', error.name || 'UnknownError');
    // Only log short messages to avoid serialization issues
    if (error.message && error.message.length < 100) {
      console.error('Error message:', error.message);
    }
    return false;
  }
}

// A safer way to process audio from the ML engine
async function safelyProcessAudio(text, embeddingsUrl) {
  console.log('🔄 Safely processing audio...');

  try {
    // Create audio context first to avoid issues
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      throw new Error('Web Audio API not supported');
    }
    const audioContext = new AudioContext();
    console.log('✅ Audio context created');

    // Run ML engine to get the result
    console.log('🔄 Running ML engine...');

    // Add proper error handling and safety checks for ML engine call
    let result;
    try {
      result = await browser.trial.ml.runEngine({
        args: [text],
        options: { speaker_embeddings: embeddingsUrl },
      });
      console.log('✅ ML engine call completed');
    } catch (mlError) {
      console.error('❌ ML engine error:', mlError.name || 'UnknownError');
      if (mlError.message && mlError.message.length < 100) {
        console.error('ML error message:', mlError.message);
      }
      throw new Error('ML engine call failed');
    }

    // Check if result is valid
    if (!result) {
      throw new Error('ML engine returned undefined result');
    }

    // Handle both array and direct object formats
    if (Array.isArray(result)) {
      console.log('ML engine returned array result, using first item');
      if (result.length === 0) {
        throw new Error('ML engine returned empty array');
      }
      result = result[0];
    } else if (typeof result === 'object') {
      console.log('ML engine returned direct object result');
      // Already an object, continue
    } else {
      console.error('❌ Unexpected result type:', typeof result);
      throw new Error(`Unexpected result type: ${typeof result}`);
    }

    // Check if result is a valid object
    if (!result || typeof result !== 'object') {
      console.error('❌ ML engine result is not an object:', typeof result);
      throw new Error('ML engine result is not an object');
    }

    // Log available keys safely
    const resultKeys = Object.keys(result);
    console.log(
      '✅ ML engine returned result with keys:',
      resultKeys.join(', ')
    );

    // Get sampling rate from result or use default
    const sampleRate = result.sampling_rate || 16000;
    console.log(`Using sample rate: ${sampleRate} Hz`);

    // Check if result.audio exists and is an object
    if (!result.audio) {
      console.error('❌ No audio property in result');
      throw new Error('No audio property in ML engine result');
    }

    if (typeof result.audio !== 'object') {
      console.error('❌ Audio property is not an object:', typeof result.audio);
      throw new Error('Audio property is not an object');
    }

    // Handle both array and object formats for audio data
    let audioData;

    if (result.audio instanceof Float32Array) {
      console.log('Audio is already a Float32Array');
      audioData = result.audio;
    } else {
      // Safely extract audio data
      console.log('🔄 Safely extracting audio data from object...');
      audioData = await safelyExtractAudioData(result.audio);
    }

    if (!audioData) {
      console.error('❌ Failed to extract audio data');
      throw new Error('Audio data extraction failed');
    }

    if (audioData.length === 0) {
      console.error('❌ Extracted audio data is empty');
      throw new Error('Extracted audio data is empty');
    }

    console.log(`✅ Successfully extracted ${audioData.length} audio samples`);

    // Create audio buffer for playback
    console.log(
      `🔄 Creating audio buffer with ${audioData.length} samples at ${sampleRate}Hz`
    );
    const audioBuffer = audioContext.createBuffer(
      1,
      audioData.length,
      sampleRate
    );
    const channelData = audioBuffer.getChannelData(0);

    // Copy data to buffer in small chunks
    console.log('🔄 Filling audio buffer...');
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, audioData.length);
      for (let j = i; j < end; j++) {
        channelData[j] = audioData[j];
      }
    }

    console.log('✅ Audio buffer created and filled');

    // Play the audio
    console.log('🔄 Starting audio playback...');
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
    console.log('🔊 Audio playback started');

    return new Promise((resolve) => {
      source.onended = () => {
        console.log('✅ Audio playback completed');
        resolve(true);
      };

      // Fallback timeout based on audio length
      const duration = (audioData.length / sampleRate) * 1000;
      setTimeout(() => {
        console.log('✅ Audio playback timeout reached');
        resolve(true);
      }, duration + 2000); // Add 2 seconds buffer
    });
  } catch (error) {
    console.error(
      '❌ Error in safelyProcessAudio:',
      error.name || 'UnknownError'
    );
    // Only log short messages
    if (error.message && error.message.length < 100) {
      console.error('Error message:', error.message);
    }
    return false;
  }
}

// Safely extract audio data without serializing problematic objects
async function safelyExtractAudioData(audioObj) {
  try {
    // Check if audioObj is valid
    if (!audioObj || typeof audioObj !== 'object') {
      console.error('❌ Invalid audio object:', typeof audioObj);
      return null;
    }

    // Get all keys from the audio object
    let keys;
    try {
      keys = Object.keys(audioObj);
      console.log(`Audio object has ${keys.length} keys`);
    } catch (keysError) {
      console.error('❌ Error getting keys from audio object:', keysError.name);
      return null;
    }

    // Find max key to determine array size
    let maxKey = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const numKey = parseInt(key, 10);
      if (!isNaN(numKey) && numKey > maxKey) {
        maxKey = numKey;
      }
    }
    console.log(`Maximum key is ${maxKey}`);

    // Create array with correct size
    const audioData = new Float32Array(maxKey + 1);

    // Process in small batches to avoid memory issues
    let extractedCount = 0;
    const BATCH_SIZE = 1000;

    for (let batchStart = 0; batchStart <= maxKey; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, maxKey);

      // Process this batch
      for (let i = batchStart; i <= batchEnd; i++) {
        // Use hasOwnProperty safely to check if key exists
        if (Object.prototype.hasOwnProperty.call(audioObj, i.toString())) {
          try {
            const value = audioObj[i];
            if (typeof value === 'number' && !isNaN(value)) {
              audioData[i] = value;
              extractedCount++;
            }
          } catch (valueError) {
            console.warn(
              `⚠️ Error accessing audio value at index ${i}:`,
              valueError.name
            );
            // Continue with other samples
          }
        }
      }
    }

    console.log(`Extracted ${extractedCount} samples`);
    return audioData;
  } catch (error) {
    console.error(
      '❌ Error extracting audio data:',
      error.name || 'UnknownError'
    );
    // Only log short messages
    if (error.message && error.message.length < 100) {
      console.error('Error message:', error.message);
    }
    return null;
  }
}

async function initializeEngine() {
  console.log('🔄 Initializing TTS engine...');
  try {
    await browser.trial.ml.createEngine({
      modelHub: 'huggingface',
      taskName: 'text-to-audio',
      modelId: 'Xenova/speecht5_tts',
      dtype: 'fp32',
    });
    console.log('✅ TTS engine initialized');
    mlEngineInitialized = true;
    return true;
  } catch (error) {
    if (error.message && error.message.includes('already created')) {
      console.log('✅ TTS engine already initialized');
      mlEngineInitialized = true;
      return true;
    }
    console.error('❌ Failed to initialize TTS engine:', error.message);
    return false;
  }
}

// Handle context menu click
async function handleContextMenuClick(info, tab) {
  const { selectionText } = info;

  if (!selectionText) {
    console.warn('⚠️ No text selected');
    return;
  }

  console.log(`Selected text: "${selectionText}"`);

  // Set up progress listener for debugging
  const progressListener = (progress) => {
    if (progress && progress.type) {
      console.log('🔄 TTS progress type:', progress.type);
    }
  };

  browser.trial.ml.onProgress.addListener(progressListener);

  try {
    const success = await speakText(selectionText);
    console.log(
      success ? '✅ Text spoken successfully' : '❌ Failed to speak text'
    );
  } catch (error) {
    console.error(
      '❌ Error in handleContextMenuClick:',
      error.name || 'unknown error'
    );
    // Only log short messages
    if (error.message && error.message.length < 100) {
      console.error('Error message:', error.message);
    }
  } finally {
    browser.trial.ml.onProgress.removeListener(progressListener);
    console.log('✅ Progress listener removed');
  }
}

// Initialize menu item
console.log('🔄 Creating context menu item...');
browser.menus.create({
  id: 'speak-text',
  title: '🔊 Speak Selected Text',
  contexts: ['selection'],
  onclick: handleContextMenuClick,
});

// Permission check
console.log('🔄 Checking permissions...');
browser.permissions.contains({ permissions: ['trialML'] }).then((granted) => {
  if (!granted) {
    console.warn('⚠️ trialML permission not granted');
  } else {
    console.log('✅ trialML permission granted');

    // Pre-initialize engine
    initializeEngine().then((success) => {
      console.log(
        success
          ? '✅ Engine pre-initialization successful'
          : '❌ Engine pre-initialization failed'
      );
    });
  }
});

console.log('🟢 TTS extension loaded');
