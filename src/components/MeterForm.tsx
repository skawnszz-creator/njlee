"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { MeterFormState } from "@/app/actions/meters";
import {
  ASSET_OWNERS,
  METER_STATUSES,
  type AssetOwner,
  type MeterStatus,
} from "@/lib/db/schema";
import type { Dictionary } from "@/lib/i18n";

export type MeterFormValues = {
  id?: string;
  assetNo: string;
  nameKo: string;
  nameJa: string;
  maker: string;
  model: string;
  assetOwner: AssetOwner;
  controlNo: string;
  calibrationDueYm: string;
  quantity: number;
  serialNo: string;
  status: MeterStatus;
  note: string;
};

const INPUT =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function MeterForm({
  action,
  values,
  title,
  cancelHref,
  t,
}: {
  action: (
    prev: MeterFormState,
    formData: FormData,
  ) => Promise<MeterFormState>;
  values: MeterFormValues;
  title: string;
  cancelHref: string;
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h1 className="text-base font-semibold text-slate-900">{title}</h1>
        </div>

        {state.error && (
          <p className="border-b border-red-200 bg-red-50 px-5 py-2.5 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
          <Field label={t.field.assetNo} required>
            <input
              name="assetNo"
              defaultValue={values.assetNo}
              required
              maxLength={40}
              className={`${INPUT} tabular`}
            />
          </Field>

          <Field label={t.field.assetOwner} required>
            <select
              name="assetOwner"
              defaultValue={values.assetOwner}
              className={INPUT}
            >
              {ASSET_OWNERS.map((value) => (
                <option key={value} value={value}>
                  {t.owner[value]}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t.field.nameKo} required>
            <input
              name="nameKo"
              defaultValue={values.nameKo}
              required
              maxLength={200}
              className={INPUT}
            />
          </Field>

          <Field label={t.field.nameJa}>
            <input
              name="nameJa"
              defaultValue={values.nameJa}
              maxLength={200}
              className={INPUT}
            />
          </Field>

          <Field label={t.field.maker}>
            <input
              name="maker"
              defaultValue={values.maker}
              maxLength={120}
              className={INPUT}
            />
          </Field>

          <Field label={t.field.model}>
            <input
              name="model"
              defaultValue={values.model}
              maxLength={200}
              className={INPUT}
            />
          </Field>

          <Field label={t.field.controlNo}>
            <input
              name="controlNo"
              defaultValue={values.controlNo}
              maxLength={120}
              className={`${INPUT} tabular`}
            />
          </Field>

          <Field label={t.field.serialNo}>
            <input
              name="serialNo"
              defaultValue={values.serialNo}
              maxLength={120}
              className={`${INPUT} tabular`}
            />
          </Field>

          <Field label={t.field.calibrationDueYm} hint={t.form.dueHint}>
            <input
              type="month"
              name="calibrationDueYm"
              defaultValue={values.calibrationDueYm}
              pattern="\d{4}-(0[1-9]|1[0-2])"
              placeholder="2027-01"
              className={`${INPUT} tabular`}
            />
          </Field>

          <Field label={t.field.quantity}>
            <input
              type="number"
              name="quantity"
              defaultValue={values.quantity}
              min={0}
              step={1}
              className={`${INPUT} tabular`}
            />
          </Field>

          <Field label={t.field.status} required>
            <select name="status" defaultValue={values.status} className={INPUT}>
              {METER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t.status[value]}
                </option>
              ))}
            </select>
          </Field>

          <div className="md:col-span-2">
            <Field label={t.field.note}>
              <textarea
                name="note"
                defaultValue={values.note}
                rows={3}
                maxLength={1000}
                className={INPUT}
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {t.common.save}
          </button>
          <Link
            href={cancelHref}
            className="rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t.common.cancel}
          </Link>
        </div>
      </div>
    </form>
  );
}
