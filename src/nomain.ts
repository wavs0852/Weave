import { MicVAD } from "@ricky0123/vad-web"
import { addToPlaylist } from "./audio-utils"
import Denque from 'denque'

let recording = false

// global vars
const sr = 16000
let isChunked = true
let totalAudioLength = 0
let lastReturnedAudioLength = 0

const frameSize = 1536 
const framePerChunk = 31 // 약 31개 프레임이 3초를 구성
const framePerPreSpeechPad = 8 // 약 8개 프레임이 0.8초를 구성
const initialPointer = frameSize * framePerPreSpeechPad // audioBuffer의 초기 포인터를 8프레임 뒤로 설정

// audioBuffer management
const audioBuffer = new Float32Array(initialPointer + (frameSize * framePerChunk * 3))
let currentWritePointer = initialPointer
let currentStartPointer = 0

const chunkSize = frameSize * framePerChunk
const sec3 = initialPointer + chunkSize
const sec6 = initialPointer + chunkSize * 2
const sec9 = initialPointer + chunkSize * 3
const sec9View = audioBuffer.subarray(sec6, sec9)

// preSpeechPadDeque management
const preSpeechPadDeque = new Denque() // 0.8초의 pre-speech 패딩을 위해 순환버퍼를 정의
const preSpeechPadView = audioBuffer.subarray(0, initialPointer)
let preSpeechWritePointer = 0


// Setup Silero VAD
const vad = await MicVAD.new({
  onFrameProcessed: (probabilities, frame) => {
    // [Recording] 
    if (recording) {
      if (totalAudioLength > chunkSize * 3) {
        // 이전 9초까지의 전사 결과도 함게 돌려주기
        // 단어 레벨 포인터를 지정하기 
        // 처음 9초까지는 노상관
        // 이후부터는 처음 9초 텍스트
        // 그다음 9초 텍스트 
        // 슬라이딩 윈도우로 보내기
      }

      audioBuffer.set(frame, currentWritePointer);
      currentWritePointer += frame.length;
      totalAudioLength += frame.length

      switch (currentWritePointer) {
        case sec3:
        case sec6:
          console.log("[VAD] 3s/6s of audio buffered.")
          addToPlaylist(audioBuffer.subarray(currentStartPointer, currentWritePointer), "3/6초 구간")
          lastReturnedAudioLength = totalAudioLength
          // send to server
          break;
        case sec9:
          console.log("[VAD] 9s of audio buffered. Initiating flush and slide.")
          addToPlaylist(audioBuffer.subarray(currentStartPointer, currentWritePointer), "9초 구간")
          lastReturnedAudioLength = totalAudioLength
          // send to server

          // reset buffer for next 9s window
          currentStartPointer = initialPointer
          currentWritePointer = sec3
          audioBuffer.set(sec9View, currentStartPointer)
          break;
      }
    // [Non-recording]  
    } else {
      if (preSpeechPadDeque.length >= framePerPreSpeechPad) {
        preSpeechPadDeque.shift()
      }
      preSpeechPadDeque.push(frame)
    }
  },
    
  onVADMisfire: () => {
    // mis-recording 상태에서 audioBuffer에 저장된 프레임들을 preSpeechPadDeque로 이동할 것인지 결정하기
    recording = false
    currentStartPointer = 0
    currentWritePointer = initialPointer
    preSpeechWritePointer = 0
    totalAudioLength = 0
    lastReturnedAudioLength = 0
  },
  onSpeechRealStart: () => {
    currentStartPointer = initialPointer - preSpeechPadDeque.length * frameSize
    while (preSpeechPadDeque.length > 0) {
      const currentFrame = preSpeechPadDeque.shift()
      preSpeechPadView.set(currentFrame, currentStartPointer + preSpeechWritePointer)
      preSpeechWritePointer += currentFrame.length
    }
  },
  onSpeechStart: () => {
    recording = true
  },
  onSpeechEnd: (audio) => {
    if (totalAudioLength > sec9) {
      console.log("Audio length:", audio.length, "Last returned audio length:", lastReturnedAudioLength )
      // audio.subarray(lastReturnedAudioLength - chunkSize * 2)
      addToPlaylist(audio.subarray(lastReturnedAudioLength - chunkSize * 2), "끝부분 오디오")
    } else {
      addToPlaylist(audio, "전체 오디오")
      console.log("[VAD] Speech ended. Buffer reset.")
    }
    


    
    recording = false
    currentStartPointer = 0
    currentWritePointer = initialPointer
    preSpeechWritePointer = 0
    totalAudioLength = 0
    lastReturnedAudioLength = 0
  },

  startOnLoad: false,
  baseAssetPath: "/lib/",
  onnxWASMBasePath: "/lib/",
  })


vad.start()