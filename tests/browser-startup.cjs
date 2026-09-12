'use strict';

// Regression: browser globals must not skip exporter registration when the
// bundled AAC CommonJS footer is immediately followed by the exporter IIFE.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
  const file = process.argv[2] || path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map(match => match[1])
    .filter(source => source.includes('globalThis.VisualizerExporter ='));
  assert.equal(scripts.length, 1, 'Final HTML must embed exactly one exporter script');

  class HTMLCanvasElement {}
  HTMLCanvasElement.prototype.captureStream = () => {};
  class MediaRecorder {
    static isTypeSupported(type) { return type === 'video/mp4'; }
  }
  const sandbox = {
    console, Blob, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout,
    performance, DOMException, WebAssembly, HTMLCanvasElement, MediaRecorder,
    navigator: { userAgent: 'Browser startup regression test' }, document: {}
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  // Intentionally exclude module/exports/require: a Node import would exercise
  // a different branch and would not reproduce the browser startup failure.
  const context = vm.createContext(sandbox);
  vm.runInContext(scripts[0], context, { filename: path.basename(file) + ':exporter' });

  assert.equal(typeof sandbox.Mediabunny, 'object', 'Media library must initialize');
  assert.equal(typeof sandbox.MediabunnyAacEncoder, 'object', 'AAC library must initialize');
  assert.equal(typeof sandbox.VisualizerExporter, 'object', 'Exporter must register in a browser without CommonJS globals');
  assert.equal(typeof sandbox.VisualizerExporter.export, 'function');
  assert.equal(typeof sandbox.VisualizerExporter.capabilities, 'function');
  const caps = await sandbox.VisualizerExporter.capabilities();
  assert.equal(caps.supported, true, 'Supported browser must enable MP4 generation');
  assert.equal(caps.mode, 'realtime');
  assert.equal(caps.realtimeMime, 'video/mp4');
  assert.equal(caps.width, 1080);
  assert.equal(caps.height, 1080);
  console.log('PASS: final HTML initializes the exporter and detects MP4 support without CommonJS globals.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
