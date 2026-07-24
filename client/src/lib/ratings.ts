// IVAO rating IDs → human labels. The API stores ratings as numeric IDs
// (e.g. pilot 8 = ATP, atc 7 = ACC); these maps turn them into the familiar
// short codes + full names. Unknown IDs fall back to the raw number.
const PILOT: Record<number, [short: string, full: string]> = {
  2: ['FS1', 'Basic Flight Student'],
  3: ['FS2', 'Flight Student'],
  4: ['FS3', 'Advanced Flight Student'],
  5: ['PP', 'Private Pilot'],
  6: ['SPP', 'Senior Private Pilot'],
  7: ['CP', 'Commercial Pilot'],
  8: ['ATP', 'Airline Transport Pilot'],
  9: ['SFI', 'Senior Flight Instructor'],
  10: ['CFI', 'Chief Flight Instructor'],
};

const ATC: Record<number, [short: string, full: string]> = {
  2: ['AS1', 'ATC Applicant'],
  3: ['AS2', 'ATC Trainee'],
  4: ['AS3', 'Advanced ATC Trainee'],
  5: ['ADC', 'Aerodrome Controller'],
  6: ['APC', 'Approach Controller'],
  7: ['ACC', 'Center Controller'],
  8: ['SEC', 'Senior Controller'],
  9: ['SAI', 'Senior ATC Instructor'],
  10: ['CAI', 'Chief ATC Instructor'],
};

export function pilotRating(id: number): { short: string; full: string } {
  const [short, full] = PILOT[id] ?? [`P${id}`, `Pilot rating ${id}`];
  return { short, full };
}

export function atcRating(id: number): { short: string; full: string } {
  const [short, full] = ATC[id] ?? [`A${id}`, `ATC rating ${id}`];
  return { short, full };
}
