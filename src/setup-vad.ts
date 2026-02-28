import { MicVAD } from "@ricky0123/vad-web"

import Denque from 'denque'

interface VADCallbacks {
  sendToServer: (
    audio: Float32Array, 
    isLong: boolean, 
    isEnded: boolean
  ) => void
}

export const setupVAD = async (callbacks: VADCallbacks) => {

  // foundation
  const frameSize = 1536 
  const framePerChunk = 31 // 약 31개 프레임이 3초를 구성
  const framePerPreSpeechPad = 8 // 약 8개 프레임이 0.8초를 구성
  const initialPointer = frameSize * framePerPreSpeechPad // audioBuffer의 초기 포인터를 8프레임 뒤로 설정

  const chunkSize = frameSize * framePerChunk
  const sec3 = initialPointer + chunkSize
  const sec6 = initialPointer + chunkSize * 2
  const sec9 = initialPointer + chunkSize * 3

  // define audioBuffer
  const dummyBuffer = new Float32Array(1) 
  const audioBuffer = new Float32Array(initialPointer + (frameSize * framePerChunk * 3))
  const lastChunkArray = audioBuffer.subarray(sec6, sec9)

  // define preSpeechPadDeque
  const preSpeechPadDeque = new Denque() // 0.8초의 pre-speech 패딩을 위해 순환버퍼를 정의
  const preSpeechPadArray = audioBuffer.subarray(0, initialPointer)

  // state management
  let currentWritePointer = initialPointer
  let currentStartPointer = 0
  let preSpeechWritePointer = 0
  let recording = false
  let totalAudioLength = 0
  let lastReturnedAudioLength = 0

  // setup silero VAD
  const vad = await MicVAD.new({
    onFrameProcessed: (probabilities, frame) => {
      if (recording) {
        audioBuffer.set(frame, currentWritePointer)
        currentWritePointer += frame.length
        totalAudioLength += frame.length

        switch (currentWritePointer) {
          case sec3:
          case sec6:
            callbacks.sendToServer(audioBuffer.slice(currentStartPointer, currentWritePointer), totalAudioLength > sec9, false)
            lastReturnedAudioLength = totalAudioLength
            break

          case sec9:
            callbacks.sendToServer(audioBuffer.slice(currentStartPointer, currentWritePointer), totalAudioLength > sec9, false)
            lastReturnedAudioLength = totalAudioLength

            // reset buffer for next 9s window
            currentStartPointer = initialPointer
            currentWritePointer = sec3
            audioBuffer.set(lastChunkArray, currentStartPointer)
            break
        }
      } else {
        if (preSpeechPadDeque.length >= framePerPreSpeechPad) preSpeechPadDeque.shift()
        preSpeechPadDeque.push(frame)
      }
    },
      
    onVADMisfire: () => {
      const misRecordedArray = audioBuffer.subarray(initialPointer, currentWritePointer)
      for (let i = 0; i < misRecordedArray.length; i += frameSize) {
        const frame = misRecordedArray.slice(i, i + frameSize)
        if (preSpeechPadDeque.length >= framePerPreSpeechPad) preSpeechPadDeque.shift()
        preSpeechPadDeque.push(frame)
      }

      currentStartPointer = 0
      currentWritePointer = initialPointer
      preSpeechWritePointer = 0
      recording = false
      totalAudioLength = 0
      lastReturnedAudioLength = 0
    },

    onSpeechRealStart: () => {
      currentStartPointer = initialPointer - preSpeechPadDeque.length * frameSize
      while (preSpeechPadDeque.length > 0) {
        const frame = preSpeechPadDeque.shift()
        preSpeechPadArray.set(frame, currentStartPointer + preSpeechWritePointer)
        preSpeechWritePointer += frame.length
      }
    },

    onSpeechStart: () => {
      recording = true
    },

    onSpeechEnd: (audio) => {
      if ((audio.length - lastReturnedAudioLength) > 24000) {
        if (totalAudioLength > sec9) {
          callbacks.sendToServer(audio.slice(lastReturnedAudioLength - chunkSize * 2), true, true)
        } else {
          callbacks.sendToServer(audio, false, true)
        }
      } else {
        callbacks.sendToServer(dummyBuffer, totalAudioLength > sec9, true)
      
      }
      
      currentStartPointer = 0
      currentWritePointer = initialPointer
      preSpeechWritePointer = 0
      recording = false
      totalAudioLength = 0
      lastReturnedAudioLength = 0
    },

    startOnLoad: false,
    baseAssetPath: "/lib/",
    onnxWASMBasePath: "/lib/",
    })

    return vad
  }
