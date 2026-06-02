/**
 * Strip block and line comments so `.jsonc` seed files parse with JSON.parse.
 * Lets the import bars accept the commented seed files in backend/events.
 */
export function stripJsonComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
