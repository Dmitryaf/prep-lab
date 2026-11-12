import { encodeWav, speechMaxSeconds } from "#domain/speech/wav.ts";
export async function recordedWav(blob: Blob): Promise<Blob> {
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > speechMaxSeconds)
      throw new Error(
        "Запись слишком длинная. Скачайте её и разделите на части.",
      );
    const output = new OfflineAudioContext(
      1,
      Math.max(1, Math.ceil(decoded.duration * 16000)),
      16000,
    );
    const source = output.createBufferSource();
    source.buffer = decoded;
    source.connect(output.destination);
    source.start();
    const rendered = await output.startRendering();
    return new Blob([encodeWav(rendered.getChannelData(0))], {
      type: "audio/wav",
    });
  } finally {
    await decoder.close();
  }
}
