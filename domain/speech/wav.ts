export const speechMaxBytes = 32_000_044;
export const speechMaxSeconds = 900;

export function encodeWav(
  samples: Float32Array,
  sampleRate = 16000,
): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, value * (value < 0 ? 0x8000 : 0x7fff), true);
  });
  return buffer;
}

export function validateSpeechWav(bytes: Uint8Array) {
  if (bytes.length < 46 || bytes.length > speechMaxBytes)
    throw new Error("Некорректный размер записи.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, size: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + size));
  if (
    text(0, 4) !== "RIFF" ||
    text(8, 4) !== "WAVE" ||
    text(12, 4) !== "fmt " ||
    text(36, 4) !== "data" ||
    view.getUint32(4, true) !== bytes.length - 8 ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== 16000 ||
    view.getUint32(28, true) !== 32000 ||
    view.getUint16(32, true) !== 2 ||
    view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== bytes.length - 44 ||
    (bytes.length - 44) % 2
  )
    throw new Error("Ожидается WAV: моно, 16 kHz, PCM16.");
  if ((bytes.length - 44) / 32000 > speechMaxSeconds)
    throw new Error(
      "Запись слишком длинная. Разделите её на несколько частей.",
    );
}
