// Suppress verbose MediaPipe WASM logging in production builds.
// MediaPipe's pose_solution_simd_wasm_bin.js logs WebGL init details which clutter the console.

const WASM_NOISE_PATTERNS = [
  'pose_solution_simd_wasm_bin',
  'gl_context_webgl.cc',
  'gl_context.cc',
  'Successfully created a WebGL context',
  'GL version:',
  'OpenGL error checking is disabled',
  'WebGL warning: drawArraysInstanced: Tex image TEXTURE_2D level 0 is incurring lazy initialization',
  'drawArraysInstanced:',
  'incurring lazy initialization'
];

const shouldSuppress = (args) => {
  if (!args || args.length === 0) return false;
  const first = String(args[0]);
  // Allow our own informative log (non-WASM)
  if (first.includes('MediaPipe initialized successfully')) return false;
  return WASM_NOISE_PATTERNS.some(p => first.includes(p));
};

export function installWasmLogFilter() {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args) => {
    if (shouldSuppress(args)) return;
    originalLog.apply(console, args);
  };

  console.warn = (...args) => {
    if (shouldSuppress(args)) return;
    originalWarn.apply(console, args);
  };

  // Keep error visible for actual errors, but suppress known WASM noise
  console.error = (...args) => {
    if (shouldSuppress(args)) return;
    originalError.apply(console, args);
  };
}
