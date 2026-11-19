/** Convert structured issue-path segments to an RFC 6901 JSON pointer (`['phases', 1, 'min']` -> `/phases/1/min`). Root is ''. */
export function toPointer(path: readonly (string | number)[]): string {
  return path.map((s) => '/' + String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
}
