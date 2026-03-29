import * as bufferModule from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = bufferModule.Buffer;
}
