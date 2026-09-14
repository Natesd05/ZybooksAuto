import type { Settings } from '../protocol/schema';
import { sectionNumber } from '../navigation/routes';
/** Human-readable validation shared by the form and runner. */
export function settingsProblem(settings: Settings, section?: string): string | null {
  if (!settings.kinds.length) return 'Select at least one activity family.';
  if (
    !Number.isInteger(settings.maxSections) ||
    settings.maxSections < 1 ||
    settings.maxSections > 20
  )
    return 'Choose a section limit between 1 and 20.';
  if (settings.scope === 'range') {
    if (!settings.endSection) return 'Choose an end section before starting a range.';
    if (!/^\d+\.\d+$/.test(settings.endSection))
      return 'Enter the end section in chapter.section format, such as 2.4.';
    if (
      section &&
      /^\d+\.\d+$/.test(section) &&
      sectionNumber(settings.endSection) < sectionNumber(section)
    )
      return 'Choose an end section at or after this section.';
  }
  return null;
}
