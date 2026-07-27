/**
 * UTC date + time input. Renders a native date picker plus a free-text 24-hour
 * HH:MM field (XX:XX) - NOT a native <input type="time">/datetime-local, which most
 * browsers render as a locale 12h AM/PM picker. Value is "YYYY-MM-DDTHH:mm" (UTC),
 * matching the rest of the app's slot/event time handling.
 */
export function DateTimeUtcInput({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const day = (value || '').slice(0, 10);
  const time = (value || '').slice(11, 16);
  const todayUtc = () => new Date().toISOString().slice(0, 10);

  const setDay = (d: string) => onChange(d ? `${d}T${time || '00:00'}` : time ? `${todayUtc()}T${time}` : '');
  const setTime = (t: string) => onChange(t ? `${day || todayUtc()}T${t}` : day ? `${day}T00:00` : '');

  return (
    <div className="flex gap-2">
      <input
        type="date"
        lang="en-GB"
        className="input"
        value={day}
        onChange={(e) => setDay(e.target.value)}
        required={required}
      />
      <input
        type="text"
        inputMode="numeric"
        placeholder="HH:MM"
        maxLength={5}
        pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
        title="24-hour UTC time, e.g. 16:00"
        className="input w-24 text-center font-mono"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        required={required}
      />
    </div>
  );
}
