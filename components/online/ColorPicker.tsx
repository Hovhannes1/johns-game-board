'use client';

import { SEAT_COLOR_HEX } from '@/components/art/palette';
import { SEAT_COLOR_IDS } from '@/lib/protocol';
import type { SeatColorId } from '@/lib/protocol';

/** Radio group of seat colors (FR-2). Each swatch also has a text label. */
export function ColorPicker({
  value,
  onChange,
  legend,
  name,
}: {
  value: SeatColorId;
  onChange: (color: SeatColorId) => void;
  legend: string;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {SEAT_COLOR_IDS.map((color) => (
          <label
            key={color}
            className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm capitalize has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brass ${value === color ? 'border-brass bg-brass/15' : 'border-parchment/20'}`}
          >
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              onChange={() => onChange(color)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className="size-3 rounded-full"
              style={{ background: SEAT_COLOR_HEX[color] }}
            />
            {color}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
