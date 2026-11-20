import { SecuritiesCreditingResponse } from './securitiesCrediting';

export type CreditingFormField =
  | 'instrument'
  | 'account'
  | 'depo'
  | 'quantity'
  | 'contractor'
  | 'contractorID'
  | 'depoNumber'
  | 'depoDivision'
  | 'creditType'
  | 'supplierName'
  | 'dealAmount'
  | 'dealDate'
  | 'settlementDate'
  | 'reference'
  | 'docTypeId'
  | 'docTypeOther'
  | 'depoDocNum'
  | 'depoDocDate'
  | 'comment';

export type CreditingFieldErrors = Partial<Record<CreditingFormField, string>>;

const FIELD_MAP: Record<string, CreditingFormField> = {
  depoinstrument_id: 'instrument',
  deposubaccount_id: 'account',
  depo: 'depo',
  quantity: 'quantity',
  contractor_id: 'contractor',
  contractorid: 'contractorID',
  contractordepoaccount: 'depoNumber',
  contractordeposection: 'depoDivision',
  changeownership: 'creditType',
  supplier: 'supplierName',
  volume: 'dealAmount',
  dealdate: 'dealDate',
  settledate: 'settlementDate',
  reference: 'reference',
  depodoctype_id: 'docTypeId',
  depodoctypeother: 'docTypeOther',
  depodocnum: 'depoDocNum',
  depodocdate: 'depoDocDate',
  comment: 'comment',
};

const STATUS_TEXT: Record<string, string> = {
  EMPTY: 'Обязательное поле',
  INVALID: 'Некорректное значение',
};

export const parseCreditingCheckResult = (
  payload: SecuritiesCreditingResponse | Record<string, unknown>,
): CreditingFieldErrors => {
  const record = payload as Record<string, unknown>;
  const list = (record.checkResult ??
    record.CheckResult ??
    []) as Array<Record<string, unknown>>;

  if (!Array.isArray(list)) {
    return {};
  }

  const errors: CreditingFieldErrors = {};

  list.forEach((item) => {
    const rawField = String(item.field ?? item.Field ?? '')
      .trim()
      .toLowerCase();
    const rawStatus = String(item.status ?? item.Status ?? '')
      .trim()
      .toUpperCase();
    const mapped = FIELD_MAP[rawField];
    if (!mapped || !rawStatus) {
      return;
    }

    errors[mapped] = STATUS_TEXT[rawStatus] ?? 'Некорректное значение';
  });

  return errors;
};

export const hasCreditingFieldErrors = (errors: CreditingFieldErrors) =>
  Object.keys(errors).length > 0;
