/** same shape as writeoff SecuritiesDepoDocType — import from securitiesWriteOff.ts in lk_m */
export type SecuritiesDepoDocType = {
  id: number;
  name: string;
  changeOwnership?: boolean | null;
  needComment: boolean;
};

export type CreditingCreditType = 'WITH_RIGHTS' | 'WITHOUT_RIGHTS' | '';

export type SecuritiesCreditingSection = {
  depoSection: string;
  depoSubAccountId: number;
};

export type SecuritiesCreditingAccount = {
  agreement: string;
  depoAccount: string;
  sections: SecuritiesCreditingSection[];
};

export type SecuritiesCreditingParameter = {
  depo: string;
  name: string;
  accounts: SecuritiesCreditingAccount[];
  changeOwnershipAllowed: boolean;
};

export type SecuritiesCreditingParamsResponse = {
  creditingParameters?: SecuritiesCreditingParameter[];
  /** fallbacks if backend wraps differently */
  data?: SecuritiesCreditingParameter[];
  disclaimer?: Array<{ text?: string }>;
};

export type SecuritiesCreditingFormDetails = {
  contractorID: string;
  depoNumber: string;
  depoDivision: string;
  creditType: CreditingCreditType;
  supplierName: string;
  dealAmount: string;
  dealDate: string;
  settlementDate: string;
  reference: string;
  docTypeId: number | null;
  docTypeOther: string;
  depoDocNum: string;
  depoDocDate: string;
  comment: string;
};

export type SecuritiesCreditingRequestParams = {
  depoInstrument_Id: number | null;
  depoSubAccount_Id: number | null;
  quantity: number | null;
  contractor_Id: number | null;
  contractorDepoAccount: string | null;
  contractorDepoSection: string | null;
  contractorID: string | null;
  depoDocType_Id?: number | null;
  depoDocTypeOther?: string | null;
  depoDocNum: string | null;
  depoDocDate: string | null;
  changeOwnership: boolean | null;
  supplier?: string | null;
  dealDate: string | null;
  settleDate: string | null;
  reference: string | null;
  volume?: number | null;
  comment?: string | null;
  noCommit?: boolean;
};

export type SecuritiesCreditingCheckResultItem = {
  field?: string;
  Field?: string;
  status?: string;
  Status?: string;
};

export type SecuritiesCreditingResponse = {
  checkResult?: SecuritiesCreditingCheckResultItem[];
  CheckResult?: SecuritiesCreditingCheckResultItem[];
  request?: Array<{ requestGuid?: string; RequestGuid?: string }>;
  Request?: Array<{ requestGuid?: string; RequestGuid?: string }>;
};

export type SecuritiesCreditingStatus =
  | 'processing'
  | 'edit'
  | 'waiting_documents'
  | 'signing_documents'
  | 'signing_document'
  | 'waiting_confirmation'
  | 'waiting_iia_close'
  | 'ok'
  | 'completed'
  | 'error'
  | string;

export type SecuritiesCreditingStatusDetails = {
  status?: SecuritiesCreditingStatus;
  Status?: SecuritiesCreditingStatus;
  maskedPhone?: string;
  MaskedPhone?: string;
  smsTimeout?: number;
  SmsTimeout?: number;
  warning?: string;
  Warning?: string;
};

export type { SecuritiesDepoDocType };
