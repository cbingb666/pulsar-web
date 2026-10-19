// Presentation only: the captured XS1 version is a zero-extended packed BCD
// value (00.00.10.17 -> 1.0.1.7). Keep unknown encodings and raw protocol values.
export function formatFirmwareVersion(version?: string): string | undefined {
  const match = version?.match(/^00\.00\.(\d{2})\.(\d{2})$/);
  return match ? `${match[1]}${match[2]}`.split("").join(".") : version;
}

export function formatFirmwareVersionMessage(message: string): string {
  return message.replace(
    /(?<![\w.])00\.00\.\d{2}\.\d{2}(?![\w.])/g,
    (version) => formatFirmwareVersion(version)!,
  );
}
