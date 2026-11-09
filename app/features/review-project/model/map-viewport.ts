// Ephemeral navigation: returning from a topic restores the canvas without
// writing UI coordinates to durable preparation progress.
export const mapViewports = new Map<
  string,
  { x: number; y: number; zoom: number }
>();
