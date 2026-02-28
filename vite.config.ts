import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {src: "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js", dest: "./lib"},
        {src: "node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx", dest: "./lib"},
        {src: "node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx", dest: "./lib"},
        {src: "node_modules/onnxruntime-web/dist/*.wasm", dest: "./lib"},
        {src: "node_modules/onnxruntime-web/dist/*.mjs", dest: "./lib"},
      ],
    }),
  ],
})
