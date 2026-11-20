export const CREDITING_STATUS_POLL_INTERVAL_MS = 1000;
export const CREDITING_STATUS_POLL_TIMEOUT_MS = 3 * 60 * 1000;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getCreditingStatus = (details: unknown): string | undefined => {
  if (!details || typeof details !== 'object') {
    return undefined;
  }

  const record = details as Record<string, unknown>;
  const status = record.status ?? record.Status;

  if (typeof status === 'string') {
    return status;
  }

  const list = (record.requestStatus ?? record.RequestStatus) as
    | Array<Record<string, unknown>>
    | undefined;
  const first = Array.isArray(list) ? list[0] : undefined;
  const nested = first?.status ?? first?.Status;

  return typeof nested === 'string' ? nested : undefined;
};

export const isCreditingStatusReady = (status?: string) => {
  if (!status) {
    return false;
  }

  return [
    'signing_documents',
    'signing_document',
    'waiting_confirmation',
    'waiting_iia_close',
    'ok',
    'completed',
    'error',
    'edit',
  ].includes(status);
};

export const isCreditingSigningStatus = (status?: string) =>
  status === 'signing_documents' || status === 'signing_document';
