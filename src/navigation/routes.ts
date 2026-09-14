import type { Handoff, Snapshot } from '../protocol/schema';
export function routeKey(url: string) {
  const value = new URL(url);
  return value.origin + value.pathname.replace(/\/$/, '');
}
export function routeIdentity(url: string) {
  const path = new URL(url).pathname.match(
    /^\/zybook\/([^/]+)\/chapter\/(\d+)\/section\/(\d+)\/?$/,
  );
  return path ? { book: path[1]!, section: `${path[2]}.${path[3]}` } : null;
}
export function sectionNumber(section: string) {
  const [chapter, part] = section.split('.').map(Number);
  return (chapter ?? 0) * 100000 + (part ?? 0);
}
export function nextHandoff(snapshot: Snapshot, link: HTMLAnchorElement | null): Handoff | null {
  if (snapshot.settings.scope === 'section' || snapshot.section === snapshot.settings.endSection)
    return null;
  if (
    !snapshot.items.some((i) => i.section === snapshot.section) ||
    snapshot.items
      .filter((i) => i.section === snapshot.section)
      .some((i) => !['complete', 'already_complete', 'skipped'].includes(i.state))
  )
    throw new Error('Resolve the activity queue before continuing.');
  if (snapshot.visited.length >= snapshot.settings.maxSections)
    throw new Error('Section limit reached. Start a new bounded run to continue.');
  if (
    !link ||
    link.hidden ||
    link.getAttribute('aria-disabled') === 'true' ||
    link.hasAttribute('disabled') ||
    !link.getClientRects().length
  )
    throw new Error('The next-section link is missing, hidden, or disabled.');
  const target = new URL(link.href);
  const current = new URL(snapshot.identity.route);
  const identity = routeIdentity(target.href);
  if (
    target.origin !== current.origin ||
    !identity ||
    identity.book !== snapshot.book ||
    sectionNumber(identity.section) <= sectionNumber(snapshot.section) ||
    sectionNumber(identity.section) > sectionNumber(snapshot.settings.endSection)
  )
    throw new Error('Next section is outside the selected book or range.');
  if (snapshot.visited.includes(routeKey(target.href)))
    throw new Error('This section was already visited.');
  return {
    token: crypto.randomUUID(),
    destination: target.href,
    ...identity,
    fromDocument: snapshot.identity.documentId,
    created: Date.now(),
  };
}
export function matchesHandoff(handoff: Handoff, url: string) {
  return Date.now() - handoff.created < 60000 && routeKey(url) === routeKey(handoff.destination);
}
