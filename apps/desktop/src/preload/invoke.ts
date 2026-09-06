/** Electron wraps main-process refusals in transport metadata; the UI needs the refusal. */
export async function invokeAction<T>(invoke: () => Promise<T>): Promise<T> {
  try { return await invoke(); }
  catch (error) {
    if (!(error instanceof Error)) throw error;
    const message = error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
    throw new Error(message);
  }
}
