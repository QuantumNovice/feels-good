/** Accept a direct public JSON URL, GitHub file link, or public repository. */
export function normalizeSourceUrl(
  input: string,
  repositoryPath = 'places.json',
): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'https:' || url.username || url.password)
    throw Error('https_required');
  url.hash = '';
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com')
    return url.href;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 2) {
    const path = repositoryPath.trim().split('/');
    if (!path.length || path.some((p) => !p || p === '.' || p === '..'))
      throw Error('invalid_repository_path');
    return `https://api.github.com/repos/${parts[0]}/${parts[1]}/contents/${path.map(encodeURIComponent).join('/')}`;
  }
  if (parts.length >= 5 && ['blob', 'raw'].includes(parts[2])) {
    return `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join('/')}`;
  }
  throw Error('github_file_required');
}
