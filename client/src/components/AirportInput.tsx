import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { api } from '../api/client';

/**
 * Airport (ICAO) input with a live typeahead from the IVAO catalogue.
 * Controlled: `value` is the ICAO string; free text is still allowed (the server
 * validates format + existence), suggestions make picking a real airport easy.
 */
export function AirportInput({
  value,
  onChange,
  placeholder = 'EGLL',
  required = false,
  className = '',
}: {
  value: string;
  onChange: (icao: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState(value);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 200);
    return () => clearTimeout(t);
  }, [value]);

  const { data: results = [] } = useQuery({
    queryKey: ['airport-search', debounced.toUpperCase()],
    queryFn: () => api.airportSearch(debounced),
    enabled: open && debounced.length >= 2,
    staleTime: 60_000,
  });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input
        className={`input font-mono uppercase ${className}`}
        placeholder={placeholder}
        required={required}
        value={value}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-fuselage-200 bg-white py-1 shadow-lg dark:border-fuselage-700 dark:bg-fuselage-900">
          {results.map((a) => (
            <li key={a.icao}>
              <button
                type="button"
                onClick={() => { onChange(a.icao); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-atmos-50 dark:hover:bg-atmos-900/30"
              >
                <MapPin size={13} className="shrink-0 text-fuselage-400" />
                <span className="font-mono font-bold text-atmos-700 dark:text-atmos-300">{a.icao}</span>
                <span className="truncate text-fuselage-600 dark:text-fuselage-300">
                  {a.name}
                  {a.city ? ` · ${a.city}` : ''}
                </span>
                {a.custom && (
                  <span className="ml-auto shrink-0 rounded bg-atmos-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-atmos-700 dark:bg-atmos-900/40 dark:text-atmos-300">
                    Custom
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
