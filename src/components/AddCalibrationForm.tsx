"use client";

import { useActionState, useEffect, useState } from "react";

import {
  createCalibrationAction,
  type CalibrationFormState,
} from "@/app/actions/calibrations";
import { CALIBRATION_RESULTS } from "@/lib/db/schema";
import type { Dictionary } from "@/lib/i18n";

const INPUT =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";

export function AddCalibrationForm({
  meterId,
  defaultDate,
  defaultNextDue,
  defaultAgency,
  t,
}: {
  meterId: string;
  defaultDate: string;
  defaultNextDue: string;
  defaultAgency: string;
  t: Dictionary;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    CalibrationFormState,
    FormData
  >(createCalibrationAction, {});

  // 저장에 성공하면 폼을 닫는다. (오류가 없고, 보내고 난 뒤)
  const [wasPending, setWasPending] = useState(false);
  useEffect(() => {
    if (pending) setWasPending(true);
    else if (wasPending && !state.error) {
      setWasPending(false);
      setOpen(false);
    } else if (!pending) {
      setWasPending(false);
    }
  }, [pending, state, wasPending]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
      >
        + {t.calibration.add}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3"
    >
      <input type="hidden" name="meterId" value={meterId} />

      {state.error && (
        <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {t.calibration.date} <span className="text-red-500">*</span>
          </span>
          <input
            type="date"
            name="calibratedOn"
            defaultValue={defaultDate}
            required
            className={`${INPUT} tabular`}
          />
          <span className="mt-1 block text-xs text-slate-400">
            {t.calibration.dateHint}
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {t.calibration.nextDue}
          </span>
          <input
            type="month"
            name="nextDueYm"
            defaultValue={defaultNextDue}
            className={`${INPUT} tabular`}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {t.calibration.result} <span className="text-red-500">*</span>
          </span>
          <select name="result" defaultValue="PASS" className={INPUT}>
            {CALIBRATION_RESULTS.map((value) => (
              <option key={value} value={value}>
                {t.result[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {t.calibration.agency}
          </span>
          <input
            name="agency"
            defaultValue={defaultAgency}
            maxLength={80}
            className={INPUT}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {t.calibration.certNo}
          </span>
          <input
            name="certificateNo"
            maxLength={120}
            className={`${INPUT} tabular`}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {t.calibration.note}
          </span>
          <input name="note" maxLength={500} className={INPUT} />
        </label>
      </div>

      <p className="mt-2 text-xs text-slate-500">{t.calibration.hint}</p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {t.common.save}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
