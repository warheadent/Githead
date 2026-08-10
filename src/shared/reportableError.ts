/** Removes exception messages and causes while retaining the useful stack frames. */
export function createReportableError(error: unknown): Error {
  const source = error instanceof Error ? error : null;
  const name = source && /^(?:[A-Za-z][A-Za-z0-9]*Error|DOMException)$/u.test(source.name)
    ? source.name
    : "Error";
  const reportable = new Error("Unexpected operational failure.");
  reportable.name = name;
  if (source?.stack) {
    const stack = source.stack.split("\n");
    stack[0] = `${name}: Unexpected operational failure.`;
    reportable.stack = stack.join("\n");
  }
  return reportable;
}
