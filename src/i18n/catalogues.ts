import adminEn from './en/admin.json'
import authEn from './en/auth.json'
import calendarEn from './en/calendar.json'
import clientsEn from './en/clients.json'
import coreEn from './en/core.json'
import crewEn from './en/crew.json'
import documentsEn from './en/documents.json'
import financeEn from './en/finance.json'
import inventoryEn from './en/inventory.json'
import notesEn from './en/notes.json'
import operationsEn from './en/operations.json'
import rentalsEn from './en/rentals.json'
import reportsEn from './en/reports.json'
import settingsEn from './en/settings.json'
import todayEn from './en/today.json'
import toolsEn from './en/tools.json'

import adminNe from './ne/admin.json'
import authNe from './ne/auth.json'
import calendarNe from './ne/calendar.json'
import clientsNe from './ne/clients.json'
import coreNe from './ne/core.json'
import crewNe from './ne/crew.json'
import documentsNe from './ne/documents.json'
import financeNe from './ne/finance.json'
import inventoryNe from './ne/inventory.json'
import notesNe from './ne/notes.json'
import operationsNe from './ne/operations.json'
import rentalsNe from './ne/rentals.json'
import reportsNe from './ne/reports.json'
import settingsNe from './ne/settings.json'
import todayNe from './ne/today.json'
import toolsNe from './ne/tools.json'

export const MODULE_CATALOGUES_EN: Record<string, Record<string, string>> = {
  admin: adminEn,
  auth: authEn,
  calendar: calendarEn,
  clients: clientsEn,
  core: coreEn,
  crew: crewEn,
  documents: documentsEn,
  finance: financeEn,
  inventory: inventoryEn,
  notes: notesEn,
  operations: operationsEn,
  rentals: rentalsEn,
  reports: reportsEn,
  settings: settingsEn,
  today: todayEn,
  tools: toolsEn,
}

export const MODULE_CATALOGUES_NE: Record<string, Record<string, string>> = {
  admin: adminNe,
  auth: authNe,
  calendar: calendarNe,
  clients: clientsNe,
  core: coreNe,
  crew: crewNe,
  documents: documentsNe,
  finance: financeNe,
  inventory: inventoryNe,
  notes: notesNe,
  operations: operationsNe,
  rentals: rentalsNe,
  reports: reportsNe,
  settings: settingsNe,
  today: todayNe,
  tools: toolsNe,
}

export const FULL_CATALOGUE_EN: Record<string, string> = {
  ...coreEn,
  ...toolsEn,
  ...adminEn,
  ...authEn,
  ...calendarEn,
  ...clientsEn,
  ...crewEn,
  ...documentsEn,
  ...financeEn,
  ...inventoryEn,
  ...notesEn,
  ...operationsEn,
  ...rentalsEn,
  ...reportsEn,
  ...settingsEn,
  ...todayEn,
}

export const FULL_CATALOGUE_NE: Record<string, string> = {
  ...coreNe,
  ...toolsNe,
  ...adminNe,
  ...authNe,
  ...calendarNe,
  ...clientsNe,
  ...crewNe,
  ...documentsNe,
  ...financeNe,
  ...inventoryNe,
  ...notesNe,
  ...operationsNe,
  ...rentalsNe,
  ...reportsNe,
  ...settingsNe,
  ...todayNe,
}
