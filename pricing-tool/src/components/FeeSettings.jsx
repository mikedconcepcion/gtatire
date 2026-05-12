import React from 'react';
import { DEFAULT_FEES } from '../lib/pricing';

function FeeInput({ label, hint, value, onChange, prefix = '$', step = '0.01' }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <span className="px-3 py-2 text-gray-500 text-sm bg-gray-800/50">{prefix}</span>
        <input
          type="number"
          step={step}
          min="0"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-transparent px-2 py-2 text-sm text-white focus:outline-none"
        />
      </div>
      {hint && <p className="text-[10px] text-gray-600 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function FeeSettings({ fees, onChange, onClose }) {
  const update = (key, val) => onChange({ ...fees, [key]: val });

  return (
    <div className="border-t border-gray-800 bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Tax & Fees (Ontario)</h3>
          <div className="flex gap-2">
            <button
              onClick={() => onChange(DEFAULT_FEES)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Reset Defaults
            </button>
            <button onClick={onClose} className="text-xs text-gray-500 hover:text-white ml-2">
              Close
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">HST Rate</label>
            <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={fees.hstRate}
                onChange={e => update('hstRate', parseFloat(e.target.value) || 0)}
                className="w-full bg-transparent px-3 py-2 text-sm text-white focus:outline-none"
              />
              <span className="px-3 py-2 text-gray-500 text-sm bg-gray-800/50">
                {(fees.hstRate * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[10px] text-gray-600 mt-0.5">Ontario standard: 0.13</p>
          </div>

          <FeeInput
            label="Tire Env. Fee (EHF)"
            hint="Per tire, ~$4.50 standard"
            value={fees.tireEhf}
            onChange={v => update('tireEhf', v)}
          />

          <FeeInput
            label="Wheel Levy"
            hint="Per wheel, if applicable"
            value={fees.wheelLevy}
            onChange={v => update('wheelLevy', v)}
          />

          <FeeInput
            label="Tire Install"
            hint="Per tire, optional"
            value={fees.installTire}
            onChange={v => update('installTire', v)}
          />

          <FeeInput
            label="Wheel Install"
            hint="Per wheel, optional"
            value={fees.installWheel}
            onChange={v => update('installWheel', v)}
          />
        </div>

        {/* Quick preview */}
        <div className="mt-3 p-3 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Example: $200 tire with current fees</p>
          <p className="text-sm text-white">
            $200.00 + ${fees.tireEhf.toFixed(2)} EHF + ${fees.installTire.toFixed(2)} install =
            <span className="text-gray-400"> ${(200 + fees.tireEhf + fees.installTire).toFixed(2)} subtotal</span>
            {' '}&times; {((1 + fees.hstRate) * 100).toFixed(0)}% =
            <span className="text-yellow-400 font-bold"> ${((200 + fees.tireEhf + fees.installTire) * (1 + fees.hstRate)).toFixed(2)} total</span>
          </p>
        </div>
      </div>
    </div>
  );
}
