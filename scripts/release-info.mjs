/** Public build identity only; never embed commit messages or environment dumps. */
export function releaseInfo({ sha = '', message = '', environment = '', pullRequest = '' } = {}) {
  const commit = /^[a-f0-9]{40}$/i.test(sha) ? sha.toLowerCase().slice(0, 7) : '';
  const target = ['production', 'preview'].includes(environment) ? environment : 'development';
  const subject = message.split(/\r?\n/, 1)[0];
  const merged =
    subject.match(/\(#([1-9]\d*)\)\s*$/)?.[1] ??
    subject.match(/^Merge pull request #([1-9]\d*)\b/)?.[1];
  const preview = target === 'preview' && /^[1-9]\d*$/.test(pullRequest) ? pullRequest : '';
  // An exact revision is required before claiming a numbered deployed release.
  const number = commit ? preview || merged : '';
  return { version: number ? `R${number}` : commit, commit, environment: target };
}
