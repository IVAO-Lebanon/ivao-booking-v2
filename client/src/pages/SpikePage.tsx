// Atmosphere design-system spike: renders IVAO's official @ivao/atmosphere-react
// components next to our current in-house components, in both light and dark, so
// we can judge the token reconciliation and look before committing to a migration.
// This route is intentionally isolated (no auth, no backend) and is NOT shipped.
import { useState } from 'react';
import {
  Button,
  Input,
  Label,
  Textarea,
  Select,
  Badge,
  Card,
  Dialog,
  Switch,
  Checkbox,
} from '@ivao/atmosphere-react';
import { Modal, StatusBadge } from '../components/ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-atmos-500">{title}</div>
      {children}
    </div>
  );
}

/** One themed panel showing Atmosphere vs. our components. Rendered twice: light + dark. */
function Panel({ theme }: { theme: 'light' | 'dark' }) {
  const [ourModal, setOurModal] = useState(false);
  return (
    <div className={`${theme === 'dark' ? 'dark' : ''} rounded-2xl border border-fuselage-200 dark:border-fuselage-800`}>
      <div className="rounded-2xl bg-fuselage-100 p-6 text-fuselage-800 dark:bg-fuselage-950 dark:text-fuselage-100">
        <div className="mb-5 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${theme === 'dark' ? 'bg-fuselage-500' : 'bg-warning-400'}`} />
          <h2 className="font-head text-lg font-bold capitalize">{theme} theme</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── Atmosphere column ── */}
          <div className="space-y-6 rounded-xl bg-white/60 p-4 dark:bg-fuselage-900/60">
            <div className="eyebrow text-atmos-600 dark:text-atmos-400">Atmosphere</div>

            <Section title="Buttons">
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Delete</Button>
                <Button variant="primary" isLoading>Saving</Button>
              </div>
            </Section>

            <Section title="Inputs">
              <div className="space-y-2">
                <Label htmlFor="a-cs">Callsign</Label>
                <Input id="a-cs" placeholder="e.g. BAW201" defaultValue="DLH427" />
                <Select
                  placeholder="Aircraft type"
                  items={[
                    { value: 'a320', label: 'Airbus A320' },
                    { value: 'b738', label: 'Boeing 737-800' },
                    { value: 'a359', label: 'Airbus A350-900' },
                  ]}
                />
                <Textarea placeholder="Booking message shown to pilots" />
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-sm"><Switch defaultChecked /> Live routes</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox defaultChecked /> Private</label>
                </div>
              </div>
            </Section>

            <Section title="Badges + Card + Dialog">
              <div className="flex flex-wrap gap-2">
                <Badge text="Booked" color="blue" hasDot />
                <Badge text="Awaiting" color="yellow" hasDot />
                <Badge text="Open" color="green" hasDot />
                <Badge text="Cancelled" color="red" hasDot />
              </div>
              <Card
                title="Heathrow Real Ops"
                description="EGLL · 01 Aug 2026 16:00z"
                content="42 of 60 slots booked. Departures and arrivals open."
                footer={<Dialog trigger={<Button size="sm" variant="primary">Book a slot</Button>} title="Book EGLL → LFPG" description="Confirm your slot for BAW201."><div className="space-y-2 py-2"><Label>Gate</Label><Input defaultValue="A12" /></div></Dialog>}
              />
            </Section>
          </div>

          {/* ── Ours column ── */}
          <div className="space-y-6 rounded-xl bg-white/60 p-4 dark:bg-fuselage-900/60">
            <div className="eyebrow text-atmos-600 dark:text-atmos-400">Ours (current)</div>

            <Section title="Buttons">
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary">Primary</button>
                <button className="btn-secondary">Secondary</button>
                <button className="btn-ghost">Ghost</button>
                <button className="btn-danger">Delete</button>
              </div>
            </Section>

            <Section title="Inputs">
              <div className="space-y-2">
                <label className="label" htmlFor="o-cs">Callsign</label>
                <input id="o-cs" className="input" placeholder="e.g. BAW201" defaultValue="DLH427" />
                <select className="input">
                  <option>Airbus A320</option>
                  <option>Boeing 737-800</option>
                  <option>Airbus A350-900</option>
                </select>
                <textarea className="input min-h-[76px]" placeholder="Booking message shown to pilots" />
              </div>
            </Section>

            <Section title="Badges + Card + Dialog">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="booked" />
                <StatusBadge status="prebooked" />
                <StatusBadge status="free" />
                <StatusBadge status="cancelled" />
              </div>
              <div className="card p-4">
                <div className="font-head font-bold">Heathrow Real Ops</div>
                <div className="text-sm text-fuselage-500">EGLL · 01 Aug 2026 16:00z</div>
                <p className="mt-2 text-sm">42 of 60 slots booked. Departures and arrivals open.</p>
                <button className="btn-primary mt-3 px-3 py-1.5 text-sm" onClick={() => setOurModal(true)}>Book a slot</button>
              </div>
              {ourModal && (
                <Modal open onClose={() => setOurModal(false)} title="Book EGLL → LFPG">
                  <div className="space-y-2">
                    <label className="label">Gate</label>
                    <input className="input" defaultValue="A12" />
                    <button className="btn-primary mt-2" onClick={() => setOurModal(false)}>Confirm</button>
                  </div>
                </Modal>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SpikePage() {
  return (
    <div className="min-h-screen bg-fuselage-100 px-4 py-8 dark:bg-fuselage-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <div className="eyebrow">Design-system spike</div>
          <h1 className="mt-1 font-head text-2xl font-extrabold text-fuselage-900 dark:text-fuselage-50">
            Atmosphere vs. current components
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-fuselage-500">
            Official <code className="font-mono text-atmos-600">@ivao/atmosphere-react</code> components on the left of each
            panel, our in-house components on the right. Both themes shown together to check the token merge.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel theme="light" />
          <Panel theme="dark" />
        </div>
      </div>
    </div>
  );
}
