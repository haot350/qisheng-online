const privateSegments = /^(?:\.env(?:\..*)?|\.git|\.ssh|\.codex|\.agents|node_modules)$/i;
const privateFile = /(?:\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?|\.(?:pem|key))$/i;

export function assertStaticReleasePath(relative) {
  const segments = relative.replaceAll('\\', '/').split('/');
  if (segments.some(segment => privateSegments.test(segment)) || privateFile.test(segments.at(-1) ?? '')) {
    throw new Error('Sensitive path cannot enter a static release: ' + relative);
  }
}
