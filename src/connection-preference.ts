const key = "pulsar-auto-connect-v1";

export function shouldAutoConnect(): boolean {
  try {
    return localStorage.getItem(key) !== "disabled";
  } catch {
    // If the saved choice cannot be read, require an explicit connection.
    return false;
  }
}

export function saveAutoConnect(enabled: boolean): boolean {
  try {
    localStorage.setItem(key, enabled ? "enabled" : "disabled");
    return true;
  } catch {
    return false;
  }
}
