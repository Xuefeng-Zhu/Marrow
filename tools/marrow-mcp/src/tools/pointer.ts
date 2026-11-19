/** Convert a path like `phases[1].min` to an RFC 6901 JSON pointer (`/phases/1/min`). Root is ''. */
export function toPointer(path: string): string {
  if (path === '') return '';
  const segs: string[] = [];
  const re = /\[(\d+)\]|([^.[\]]+)/g;
  for (let m = re.exec(path); m; m = re.exec(path)) segs.push(m[1] ?? m[2] ?? '');
  return segs.map((s) => '/' + s.replace(/~/g, '~0').replace(/\//g, '~1')).join('');
}
