/** Validate a Bundle Name before it reaches filesystem operations. */
export function bundleNameProblem(name: string): string | null {
  if (name.length === 0 || name.trim().length === 0) {
    return 'Enter a folder name.'
  }
  if (name !== name.trim()) {
    return 'Remove the leading or trailing spaces from the folder name.'
  }
  if (name.length > 100) {
    return 'Use a folder name with 100 characters or fewer.'
  }
  if (name === '.' || name === '..') {
    return `Choose a folder name other than "${name}".`
  }
  if (name.endsWith('.')) {
    return 'Remove the trailing period from the folder name.'
  }
  if (/[<>:"/\\|?*]/u.test(name)) {
    return 'Use a folder name without < > : " / \\ | ? * characters.'
  }
  for (const character of name) {
    if ((character.codePointAt(0) ?? 0) < 32) {
      return 'Remove control characters from the folder name.'
    }
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name)) {
    return `Choose another folder name; Windows reserves "${name}".`
  }
  return null
}
