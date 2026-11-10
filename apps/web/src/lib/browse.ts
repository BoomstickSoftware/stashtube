import { oneOf } from './storage'

// Browse's sections (decisions/five-tab-navigation): videos and the three directories share the
// Browse tab, switched by this strip at the top of each. It scrolls sideways on a narrow phone.
export const browseSections = [
  ['/browse', 'Videos'],
  ['/performers', 'Performers'],
  ['/studios', 'Studios'],
  ['/tags', 'Categories'],
] as const

// The Browse tab reopens the section last used (BrowseStrip writes it, Layout reads it); a tap on
// the tab while already in Browse goes to Videos.
export const BROWSE_SECTION_KEY = 'flix.browse.section'
export const asBrowseSection = oneOf(
  browseSections.map(([to]) => to),
  '/browse',
)
