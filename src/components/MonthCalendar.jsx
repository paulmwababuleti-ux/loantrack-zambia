import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);

/** A compact month-grid calendar. Days with something due get a dot; tap a day to see what's due. */
export default function MonthCalendar({ entriesByDate, onSelectDay }) {
  const [cursor, setCursor] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });

  const cells = useMemo(() => {
    const startWeekday = new Date(cursor.y, cursor.m, 1).getDay();
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    return [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  }, [cursor]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  function go(delta) {
    let m = cursor.m + delta, y = cursor.y;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setCursor({ y, m });
  }

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button aria-label="Previous month" onClick={() => go(-1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-stone-600 active:bg-stone-100"><ChevronLeft size={20} /></button>
        <div className="text-base font-semibold text-stone-900">{monthLabel}</div>
        <button aria-label="Next month" onClick={() => go(1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-stone-600 active:bg-stone-100"><ChevronRight size={20} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-medium text-stone-400">
        {WEEKDAYS.map((w, i) => <div key={i}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const iso = isoDate(cursor.y, cursor.m, d);
          const dayEntries = entriesByDate[iso] || [];
          const isToday = iso === todayIso();
          const hasEntries = dayEntries.length > 0;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => hasEntries && onSelectDay(iso, dayEntries)}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm ${
                isToday ? 'bg-brand-600 font-bold text-white'
                : hasEntries ? 'bg-brand-50 font-medium text-stone-900 active:bg-brand-100'
                : 'text-stone-400'
              }`}
            >
              {d}
              {hasEntries && <span className={`h-1.5 w-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-brand-600'}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
