import { Link } from 'react-router-dom';
import { Radar } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-fuselage-100 text-fuselage-400 dark:bg-fuselage-800">
        <Radar size={32} />
      </div>
      <h1 className="text-2xl font-extrabold">Lost in the airspace</h1>
      <p className="text-fuselage-500">That page doesn't exist.</p>
      <Link to="/" className="btn-primary mt-2">
        Back to events
      </Link>
    </div>
  );
}
