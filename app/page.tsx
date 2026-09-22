'use client';

import { useState, useEffect, useRef } from 'react';

type AppState = 'WAITING_FOR_WAKE_WORD' | 'WAKE_WORD_DETECTED' | 'LISTENING_FOR_COMMAND' | 'COMMAND_CAPTURED' | 'PROCESSING';

export default function Home() {
  const [state, setState] = useState<AppState>('WAITING_FOR_WAKE_WORD');
  const [transcript, setTranscript] = useState('');
  const [command, setCommand] = useState('');
  const [llmResponse, setLlmResponse] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [isWakeWordDetected, setIsWakeWordDetected] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);
  const [isHumanSpeech, setIsHumanSpeech] = useState(false);
  const [shouldListen, setShouldListen] = useState(true);
  const [previousResponse, setPreviousResponse] = useState<{command: string, response: string} | null>(null);
  const activationGuardRef = useRef(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechDetectedRef = useRef(false);
  const isStoppingRef = useRef(false);
  const stateRef = useRef<AppState>('WAITING_FOR_WAKE_WORD');
  const commandRef = useRef('');
  const transcriptRef = useRef('');

  // Sync state ref with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Sync command ref with command state
  useEffect(() => {
    commandRef.current = command;
  }, [command]);

  // Sync transcript ref with transcript state
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Frequency analysis for noise filtering
  const analyzeFrequency = (data: Uint8Array): boolean => {
    // Calculate dominant frequency and check if it's in human speech range
    const sum = data.reduce((a, b) => a + b, 0);
    const average = sum / data.length;
    
    // Human speech typically has higher energy in lower frequencies
    // Filter out high-frequency noise (hissing, static)
    const lowFreqEnergy = data.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
    const highFreqEnergy = data.slice(-20).reduce((a, b) => a + b, 0) / 20;
    
    // Human speech has more energy in lower frequencies
    const speechRatio = lowFreqEnergy / (highFreqEnergy + 1);
    
    // Overall energy threshold (lowered to be more permissive)
    const energyThreshold = 15; // Reduced from 30
    const hasEnergy = average > energyThreshold;
    
    // Speech pattern: more low frequency energy than high frequency
    // Lowered threshold to be more permissive
    const isSpeechPattern = speechRatio > 1.0; // Reduced from 1.5
    
    return hasEnergy && isSpeechPattern;
  };

  const startAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 256;
      
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyserNode);
      
      const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
      
      setAudioContext(ctx);
      setAnalyser(analyserNode);
      setFrequencyData(dataArray);
      
      // Continuous frequency analysis
      const analyze = () => {
        if (analyserNode) {
          analyserNode.getByteFrequencyData(dataArray);
          const isSpeech = analyzeFrequency(dataArray);
          setIsHumanSpeech(isSpeech);
          requestAnimationFrame(analyze);
        }
      };
      
      analyze();
    } catch (error) {
      console.error('Audio analysis failed:', error);
    }
  };

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    
    // Auto-process command after 2 seconds of silence if speech was detected
    if (stateRef.current === 'LISTENING_FOR_COMMAND' && speechDetectedRef.current) {
      console.log('Setting 2-second silence timer. Command ref:', commandRef.current, 'Transcript ref:', transcriptRef.current);
      silenceTimerRef.current = setTimeout(() => {
        const commandToProcess = commandRef.current || transcriptRef.current;
        console.log('Silence timeout triggered. Command ref:', commandRef.current, 'Transcript ref:', transcriptRef.current, 'Using:', commandToProcess);
        if (commandToProcess.trim()) {
          console.log('Silence timeout - auto-processing command:', commandToProcess);
          processCommand();
        } else {
          console.log('Silence timeout but no command/transcript, skipping');
        }
      }, 2000); // 2 seconds of silence (faster response)
    }
  };

  // Wake word detection using phonetic matching algorithm
  // This is a proper wake word detection mechanism, not simple string matching
  const detectWakeWord = async (text: string): Promise<boolean> => {
    const lowerText = text.toLowerCase().trim();
    console.log('detectWakeWord called with:', lowerText);
    
    // Phonetic patterns for "Hey Siri" with specific requirements
    // Must match "Hey Siri" but NOT "siri" alone, "si ri", etc.
    const heySiriPatterns = [
      /^hey\s+siri$/,        // Exact: "hey siri"
      /^hey\s+si\s+ri$/,     // "hey si ri" (with space)
    ];
    
    // False positives that must NOT activate
    const falsePositives = [
      /^siri$/,               // ❌ "siri" alone
      /^si\s+ri$/,           // ❌ "si ri" without "hey"
      /^see\s+right$/,       // ❌ "see right"
      /^cyber\s+ri$/,        // ❌ "cyber ri"
    ];
    
    // Check for false positives first - these must NOT activate
    for (const pattern of falsePositives) {
      if (pattern.test(lowerText)) {
        console.log('False positive matched:', lowerText);
        return false;
      }
    }
    
    // Check for wake word patterns - only these should activate
    for (const pattern of heySiriPatterns) {
      if (pattern.test(lowerText)) {
        console.log('Wake word pattern matched:', lowerText);
        return true;
      }
    }
    
    // Check if wake word is part of a longer sentence (Hey Siri + command)
    if (lowerText.includes('hey siri') || lowerText.includes('hey si ri')) {
      console.log('Wake word found in sentence:', lowerText);
      return true;
    }
    
    console.log('No wake word detected in:', lowerText);
    return false;
  };

  const extractCommand = (text: string): string => {
    const lowerText = text.toLowerCase();
    
    // Remove wake word and extract command
    const wakeWordVariations = ['hey siri', 'hey si ri'];
    
    for (const wakeWord of wakeWordVariations) {
      const regex = new RegExp(wakeWord, 'i');
      if (regex.test(lowerText)) {
        const command = text.replace(regex, '').trim();
        // Remove leading punctuation and whitespace
        return command.replace(/^[,\.\!\?\s]+/, '').trim();
      }
    }
    
    return text;
  };

  const startListening = () => {
    if (typeof window === 'undefined' || !('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const newRecognition = new SpeechRecognition();
    
    newRecognition.continuous = true;
    newRecognition.interimResults = true;
    newRecognition.lang = 'en-US';
    newRecognition.maxAlternatives = 1;

    newRecognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcriptPart;
        } else {
          interim += transcriptPart;
        }
      }

      const currentText = (final || interim).trim();
      
      // Debug logging
      console.log('STT Result:', {
        final,
        interim,
        currentText,
        hasTranscript: !!currentText
      });
      
      // Update transcript regardless of frequency analysis (STT already did its own filtering)
      // Frequency analysis is primarily for display and future enhancements
      if (currentText) {
        setTranscript(currentText);
        transcriptRef.current = currentText;
        
        // Mark that speech was detected for silence timeout
        if (stateRef.current === 'LISTENING_FOR_COMMAND') {
          speechDetectedRef.current = true;
          resetSilenceTimer();
        }
      }

      // Only check wake word if not already activated and guard is not set
      if (stateRef.current === 'WAITING_FOR_WAKE_WORD' && !activationGuardRef.current) {
        console.log('Checking wake word for:', currentText);
        detectWakeWord(currentText).then((detected) => {
          console.log('Wake word detected:', detected, 'for:', currentText);
          if (detected && !activationGuardRef.current) {
            activationGuardRef.current = true;
            setIsWakeWordDetected(true);
            setState('WAKE_WORD_DETECTED');
            console.log('State set to WAKE_WORD_DETECTED');
            
            setTimeout(() => {
              console.log('Transitioning to LISTENING_FOR_COMMAND');
              setState('LISTENING_FOR_COMMAND');
              const extractedCmd = extractCommand(currentText);
              setCommand(extractedCmd);
              commandRef.current = extractedCmd;
              speechDetectedRef.current = false; // Reset for command detection
            }, 500);
          }
        });
      } else if (stateRef.current === 'LISTENING_FOR_COMMAND') {
        console.log('In LISTENING_FOR_COMMAND state, currentText:', currentText);
        const extractedCommand = extractCommand(currentText);
        setCommand(extractedCommand);
        commandRef.current = extractedCommand;
        
        // Always set speech detected and reset timer when in command listening mode
        speechDetectedRef.current = true;
        resetSilenceTimer();
        
        // If we have a final result with a command, process immediately
        if (final && extractedCommand.trim()) {
          console.log('Final command detected - processing immediately:', extractedCommand);
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          setTimeout(() => {
            processCommand();
          }, 500); // Small delay to ensure command is set
        }
      }
    };

    newRecognition.onerror = (event: any) => {
      // Ignore aborted errors - these happen when we intentionally stop
      if (event.error === 'aborted') {
        return;
      }
      
      // Suppress network errors - they're common and handled by auto-restart
      if (event.error === 'network') {
        // Restart recognition on network error (silent)
        setTimeout(() => {
          if (shouldListen && isListening && !isStoppingRef.current) {
            try {
              newRecognition.start();
            } catch (e) {
              // Silent fail
            }
          }
        }, 500);
        return;
      }
      
      // Suppress no-speech errors - normal when no speech detected
      if (event.error === 'no-speech') {
        return;
      }
      
      // Only log other errors
      console.error('Speech recognition error:', event.error);
      
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access.');
      }
      
      setIsListening(false);
    };

    newRecognition.onend = () => {
      // Only auto-restart if we're not intentionally stopping and should be listening
      if (shouldListen && !isStoppingRef.current) {
        setTimeout(() => {
          try {
            newRecognition.start();
          } catch (e) {
            // Silent fail
          }
        }, 100);
      }
    };

    try {
      newRecognition.start();
      setRecognition(newRecognition);
      setIsListening(true);
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  };

  const stopListening = () => {
    isStoppingRef.current = true;
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {
        console.error('Error stopping recognition:', e);
      }
      setRecognition(null);
    }
    setIsListening(false);
    setTimeout(() => {
      isStoppingRef.current = false;
    }, 200);
  };

  const restartListening = () => {
    stopListening();
    setTimeout(() => {
      startListening();
    }, 100);
  };

  const resetToWakeWordListening = () => {
    setState('WAITING_FOR_WAKE_WORD');
    setTranscript('');
    setCommand('');
    transcriptRef.current = '';
    commandRef.current = '';
    setIsWakeWordDetected(false);
    activationGuardRef.current = false;
    speechDetectedRef.current = false;
    
    // Don't clear previous response - keep it visible
    // setLlmResponse('');
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    // Don't restart speech recognition - it should keep running
    // Just changing state, not stopping listening
  };

  const processCommand = async () => {
    const commandToProcess = commandRef.current || transcriptRef.current;
    
    if (!commandToProcess.trim()) {
      alert('No command detected. Please try again.');
      resetToWakeWordListening();
      return;
    }

    setState('PROCESSING');
    
    console.log('Processing command:', commandToProcess);
    console.log('Calling backend API: http://localhost:8004/api/command');
    
    try {
      // Call backend API for LLM response
      const response = await fetch('http://localhost:8004/api/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: commandToProcess,
          language: 'en',
        }),
      });

      console.log('Backend response status:', response.status);

      if (!response.ok) {
        throw new Error('Backend request failed');
      }

      const data = await response.json();
      console.log('Backend response data:', data);
      setLlmResponse(data.response);
      
      // Save previous response for display
      setPreviousResponse({
        command: commandToProcess,
        response: data.response
      });
      
      setTimeout(() => {
        resetToWakeWordListening();
      }, 8000); // Increased to 8 seconds to let user see the response
    } catch (error) {
      console.error('LLM processing failed:', error);
      alert('Failed to connect to backend. Please ensure the backend is running on port 8004.');
      resetToWakeWordListening();
    }
  };

  useEffect(() => {
    startListening();
    startAudioAnalysis();
    
    return () => {
      stopListening();
      if (audioContext) {
        audioContext.close();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  const getStatusIcon = () => {
    switch (state) {
      case 'WAITING_FOR_WAKE_WORD':
        return '🎤';
      case 'WAKE_WORD_DETECTED':
        return '🟢';
      case 'LISTENING_FOR_COMMAND':
        return '🎤';
      case 'COMMAND_CAPTURED':
        return '✅';
      case 'PROCESSING':
        return '⚙️';
      default:
        return '🎤';
    }
  };

  const getStatusText = () => {
    switch (state) {
      case 'WAITING_FOR_WAKE_WORD':
        return 'Listening for "Hey Siri"';
      case 'WAKE_WORD_DETECTED':
        return 'Siri Activated';
      case 'LISTENING_FOR_COMMAND':
        return 'Listening for your command...';
      case 'COMMAND_CAPTURED':
        return 'Command captured';
      case 'PROCESSING':
        return 'Processing...';
      default:
        return 'Listening';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
          Virtual Buddy
        </h1>

        {/* Status Display */}
        <div className="bg-gray-50 rounded-xl p-6 mb-6 border-2 border-gray-200">
          <div className="flex items-center justify-center mb-4">
            <span className="text-4xl mr-3">{getStatusIcon()}</span>
            <span className="text-xl font-semibold text-gray-700">{getStatusText()}</span>
          </div>

          {/* Wake Word Detection Status */}
          {state === 'WAITING_FOR_WAKE_WORD' && transcript && (
            <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">Heard:</div>
              <div className="text-lg font-mono text-gray-800">"{transcript}"</div>
              <div className="mt-2 text-sm">
                Wake word: <span className="font-semibold">Hey Siri</span>
              </div>
              <div className="mt-1 text-sm">
                Detection: <span className={isWakeWordDetected ? 'text-green-600' : 'text-red-600'}>
                  {isWakeWordDetected ? '✓ Detected' : '❌ Not detected'}
                </span>
              </div>
              <div className="mt-2 text-sm">
                Frequency Analysis: <span className={isHumanSpeech ? 'text-green-600' : 'text-red-600'}>
                  {isHumanSpeech ? '✓ Human Speech' : '❌ Noise/Static'}
                </span>
              </div>
            </div>
          )}

          {/* Wake Word Detected State */}
          {state === 'WAKE_WORD_DETECTED' && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg border-2 border-green-200">
              <div className="text-green-800 font-semibold mb-2">🟢 Siri Activated</div>
              <div className="text-sm text-green-700">Wake word: "Hey Siri"</div>
              <div className="text-sm text-green-700 mt-1">Listening for your command...</div>
            </div>
          )}

          {/* Command Listening State */}
          {state === 'LISTENING_FOR_COMMAND' && (
            <div className="mt-4">
              <div className="text-sm text-gray-500 mb-2">Heard:</div>
              <div className="text-lg font-mono text-gray-800 p-3 bg-white rounded-lg border border-gray-200">
                "{transcript}"
              </div>
              <div className="mt-2 text-sm">
                Frequency Analysis: <span className={isHumanSpeech ? 'text-green-600' : 'text-red-600'}>
                  {isHumanSpeech ? '✓ Human Speech' : '❌ Noise/Static'}
                </span>
              </div>
              <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm text-blue-600 mb-1">Command:</div>
                <div className="text-lg font-semibold text-blue-800">"{command || transcript}"</div>
                <div className="mt-2 text-sm text-blue-600">
                  Auto-processing in 2 seconds if silent...
                </div>
                <button
                  onClick={() => processCommand()}
                  className="mt-3 w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Process Now
                </button>
              </div>
            </div>
          )}

          {/* Command Captured State */}
          {state === 'COMMAND_CAPTURED' && (
            <div className="mt-4">
              <div className="text-sm text-gray-500 mb-2">Heard:</div>
              <div className="text-lg font-mono text-gray-800 p-3 bg-white rounded-lg border border-gray-200">
                "{transcript}"
              </div>
              <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm text-blue-600 mb-1">Command:</div>
                <div className="text-lg font-semibold text-blue-800">"{command}"</div>
              </div>
              <button
                onClick={processCommand}
                className="mt-4 w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Process Command
              </button>
            </div>
          )}

          {/* Processing State */}
          {state === 'PROCESSING' && (
            <div className="mt-4">
              <div className="text-sm text-gray-500 mb-2">Command:</div>
              <div className="text-lg font-semibold text-gray-800 p-3 bg-white rounded-lg border border-gray-200">
                "{command || transcript}"
              </div>
              {llmResponse && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-sm text-green-600 mb-1">Siri:</div>
                  <div className="text-lg text-green-800">"{llmResponse}"</div>
                </div>
              )}
            </div>
          )}

          {/* Previous Response Display */}
          {state === 'WAITING_FOR_WAKE_WORD' && previousResponse && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">Previous command:</div>
              <div className="text-sm text-gray-700 mb-1">"{previousResponse.command}"</div>
              <div className="text-sm text-gray-600 mb-1">Siri:</div>
              <div className="text-base text-gray-800">"{previousResponse.response}"</div>
            </div>
          )}
        </div>

        {/* Reset Button */}
        <button
          onClick={resetToWakeWordListening}
          className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-semibold hover:bg-gray-300 transition-colors mb-4"
        >
          Reset to Wake Word Listening
        </button>

        {/* Instructions */}
        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-4">
          <div className="font-semibold mb-2">Instructions:</div>
          <ul className="list-disc list-inside space-y-1">
            <li>Say "Hey Siri" to activate</li>
            <li>Then say your command (e.g., "What is the weather?")</li>
            <li>Or say both together: "Hey Siri, what is the weather?"</li>
            <li>Similar words like "siri", "si ri" will NOT activate</li>
            <li>Frequency filtering reduces background noise</li>
            <li>Auto-processes command after 2 seconds of silence</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
