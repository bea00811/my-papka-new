import { useEffect, useMemo, useState } from 'react';
import { NumberFormatValues } from 'react-number-format';
import { useNavigate } from 'react-router-dom';

import {
  BottomSheet,
  Button,
  Checkbox,
  CircleLoader,
  DatePicker,
  Input,
  SearchSelect,
  Text,
} from '@aurora/components';
import { APP_TITLE, CDN_BASE_URL } from 'const/app';
import { DEFAULT_DATE_VIEW_FORMAT } from 'const/date';
import { ROUTE_SECURITIES_WRITEOFF_ORDER, ROUTE_TRANSFERS } from 'const/routes';
import { DateTime } from 'luxon';

import { isMobileDevice } from 'core/DeviceDetector';
import {
  useGetSecuritiesContractorsQuery,
  useGetSecuritiesWriteOffParamsQuery,
  useLazyGetSecuritiesWriteOffFilesQuery,
  useLazyGetSecuritiesWriteOffQuery,
  useSecuritiesWriteOffMutation,
} from 'core/api/transfers';

import { currencySign, sumFormatter } from 'utils/sumFormatter';

import { SECURITIES_WRITEOFF_PAGE_TITLE } from 'modules/Transfers/constants';
import ArrowNextIcon from 'modules/Transfers/pages/Refill/icons/ArrowNextIcon';
import {
  SecuritiesContractor,
  SecuritiesWriteOffAccount,
  SecuritiesWriteOffMode,
  SecuritiesWriteOffNonSbpDetails,
  SecuritiesWriteOffParameter,
  SecuritiesWriteOffRequestParams,
  SecuritiesWriteOffResponse,
  SecuritiesWriteOffStatus,
  WriteOffCreditType,
} from 'modules/Transfers/types';

import { HeaderPage } from 'components';
import { getSrc } from 'components/Instrument/components/InstrumentIcon/helpers';

import { ReactComponent as Calendar } from 'images/icons/calendarI.svg';
import { ReactComponent as BackSvg } from 'images/icons/glyphs/back.svg';

import BlockedContent from '../../components/BlockedContent';
import WriteOffFailed from '../SecuritiesWriteOffOrder/WriteOffFailed';
import styles from './SecuritiesWriteOff.module.pcss';
import SecurityIcon from './SecurityIcon';
import {
  WriteOffFieldErrors,
  WriteOffFormField,
  hasWriteOffFieldErrors,
  parseWriteOffCheckResult,
  renderWriteOffHtml,
} from './writeOffCheckResult';
import { DEFAULT_WRITEOFF_ERROR_MESSAGE, getWriteOffErrorMessage } from './writeOffErrors';
import {
  WRITEOFF_STATUS_POLL_INTERVAL_MS,
  WRITEOFF_STATUS_POLL_TIMEOUT_MS,
  getWriteOffStatus,
  isWriteOffSigningStatus,
  isWriteOffStatusReady,
  sleep,
} from './writeOffStatus';

const ACCOUNT_HINT = 'Счёт депо (депозитарий, номер договора)';
const LATIN_DIGIT_RE = /[^\dA-Za-z]/g;
const EMPTY_NON_SBP: SecuritiesWriteOffNonSbpDetails = {
  contractorID: '',
  depoNumber: '',
  depoDivision: '',
  creditType: '',
  supplierName: '',
  dealAmount: '',
  dealDate: '',
  settlementDate: '',
  reference: '',
  contractNumber: '',
  contractDate: '',
  comment: '',
};
const CREDIT_TYPE_OPTIONS: Array<{ id: WriteOffCreditType; value: string }> = [
  { id: 'WITH_RIGHTS', value: 'С переходом прав' },
  { id: 'WITHOUT_RIGHTS', value: 'Без перехода прав' },
];

const sanitizeLatin = (value: string, max: number) =>
  value.replace(LATIN_DIGIT_RE, '').slice(0, max);

const parseFormDate = (value: string) => {
  if (!value) {
    return null;
  }

  const parsed = DateTime.fromFormat(value, DEFAULT_DATE_VIEW_FORMAT);
  return parsed.isValid ? parsed : null;
};

const toIsoDate = (value: string) => parseFormDate(value)?.toISODate() ?? null;

const getContractorIdentifier = (contractor?: SecuritiesContractor | null) =>
  contractor?.contractorID ?? contractor?.contractorId ?? contractor?.depoIdentifier ?? '';

const getInstrumentIconSrc = (instrumentImageName?: string) =>
  instrumentImageName ? getSrc(CDN_BASE_URL, instrumentImageName) : undefined;

const getModeIconSrc = (imageName?: string) =>
  imageName ? getSrc(CDN_BASE_URL, imageName) : undefined;

const getQuantityFractionPart = (fractionPart?: number) => {
  if (fractionPart == null || !Number.isFinite(fractionPart) || fractionPart < 0) {
    return 0;
  }

  return Math.floor(fractionPart);
};

/** Одинаковый формат для value и подсказки — ровно QuantityFractionPart знаков после точки. */
const formatQuantity = (value: number, fractionPart?: number) => {
  const digits = getQuantityFractionPart(fractionPart);
  return value.toFixed(digits);
};

const formatQuantityHint = (
  quantity: number | undefined,
  fractionPart: number | undefined,
  label: string,
) =>
  quantity == null || !Number.isFinite(quantity)
    ? undefined
    : `${label} ${formatQuantity(quantity, fractionPart)} шт.`;

const toQuantityNumber = (value: string) => {
  const normalized = value.trim().replace(',', '.');
  if (!normalized || normalized === '.') {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Комиссия способа + SendCostsComission, если включён чекбокс расходов. */
const getDisplayCommission = (
  mode: SecuritiesWriteOffMode | null | undefined,
  sendCosts: boolean,
) => {
  if (mode == null) {
    return '';
  }

  const base = Number(mode.comission) || 0;
  const sendCostsPart =
    sendCosts && mode.sendCostsComission != null && Number.isFinite(Number(mode.sendCostsComission))
      ? Number(mode.sendCostsComission)
      : 0;

  return String(base + sendCostsPart);
};

const formatCommissionDisplay = (value: string): string => {
  if (value === '') {
    return '';
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return '';
  }

  return `${sumFormatter(amount, 2)} ${currencySign('RUB')}`;
};

/**
 * Нормализация из react-number-format:
 * - точка как разделитель;
 * - без ведущих нулей;
 * - не больше QuantityFractionPart знаков после точки.
 */
const normalizeQuantityFromNumberFormat = (values: NumberFormatValues, fractionPart?: number) => {
  const digits = getQuantityFractionPart(fractionPart);
  const rawValue = (values.value ?? '').replace(',', '.');

  if (!rawValue) {
    return '';
  }

  // Пока печатают "5." — сохраняем незавершённый ввод
  if (digits > 0 && rawValue.endsWith('.')) {
    const intValue =
      values.floatValue != null && Number.isFinite(values.floatValue)
        ? String(Math.trunc(Math.abs(values.floatValue)))
        : '0';
    return `${intValue}.`;
  }

  if (values.floatValue != null && Number.isFinite(values.floatValue) && digits === 0) {
    return String(values.floatValue);
  }

  const cleaned = rawValue.replace(/[^\d.]/g, '');
  const separatorIndex = cleaned.indexOf('.');
  const rawInteger =
    separatorIndex === -1 ? cleaned : cleaned.slice(0, separatorIndex).replace(/\D/g, '');
  const strippedInteger = rawInteger.replace(/^0+/, '');
  const integerPart = strippedInteger === '' ? (rawInteger.length > 0 ? '0' : '') : strippedInteger;

  if (digits === 0 || separatorIndex === -1) {
    return integerPart;
  }

  const fractionValue = cleaned
    .slice(separatorIndex + 1)
    .replace(/\D/g, '')
    .slice(0, digits);

  return `${integerPart || '0'}.${fractionValue}`;
};

const mapInstrumentToOption = (instrument: SecuritiesWriteOffParameter) => ({
  id: instrument.depoInstrumentId,
  value: instrument.name,
  description: [
    instrument.instrumentShortType,
    instrument.issuerName,
    instrument.isin,
    formatQuantityHint(instrument.quantity, instrument.quantityFractionPart, 'Количество:'),
  ]
    .filter(Boolean)
    .join(' · '),
  iconLeft: (
    <SecurityIcon
      src={getInstrumentIconSrc(instrument.instrumentImageName)}
      alt={instrument.name}
    />
  ),
});

const mapAccountToOption = (account: SecuritiesWriteOffAccount, fractionPart?: number) => ({
  id: account.depoSubAccountId,
  value: account.name,
  description: formatQuantityHint(account.quantity, fractionPart, 'Количество:'),
  disabled: !account.allowed,
  disabledDescription: !account.allowed ? account.reason : undefined,
});

const mapModeToOption = (mode: SecuritiesWriteOffMode) => ({
  id: mode.code,
  value: mode.name,
  disabled: !mode.allowed,
  disabledDescription: !mode.allowed ? mode.reason : undefined,
  iconLeft: <SecurityIcon src={getModeIconSrc(mode.imageName)} alt={mode.name} square />,
});

const mapContractorToOption = (contractor: SecuritiesContractor, index: number) => ({
  id: contractor.id ?? `${contractor.name}-${index}`,
  value: contractor.name,
});

const filterByQuery = (
  instruments: SecuritiesWriteOffParameter[],
  query: string,
  fields: Array<keyof SecuritiesWriteOffParameter>,
): SecuritiesWriteOffParameter[] => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return instruments;
  }

  return instruments.filter((instrument) =>
    fields.some((field) => {
      const value = instrument[field];
      return typeof value === 'string' && value.toLowerCase().includes(normalizedQuery);
    }),
  );
};

const getRequestGuidFromResponse = (response: SecuritiesWriteOffResponse): string | undefined => {
  const fromRequest = response.request?.[0]?.requestGuid;
  if (fromRequest) {
    return fromRequest;
  }

  const record = response as Record<string, unknown>;
  const nestedRequest = record.request ?? record.Request;

  if (Array.isArray(nestedRequest) && nestedRequest[0]) {
    const first = nestedRequest[0] as Record<string, unknown>;
    const guid = first.requestGuid ?? first.RequestGuid;
    return typeof guid === 'string' ? guid : undefined;
  }

  const topLevelGuid = record.requestGuid ?? record.RequestGuid;
  return typeof topLevelGuid === 'string' ? topLevelGuid : undefined;
};

const SecuritiesWriteOff = () => {
  const navigate = useNavigate();
  const isMobile = isMobileDevice();
  const [instrumentValue, setInstrumentValue] = useState('');
  const [isinValue, setIsinValue] = useState('');
  const [accountValue, setAccountValue] = useState('');
  const [modeValue, setModeValue] = useState('');
  const [quantityValue, setQuantityValue] = useState('');
  const [commissionValue, setCommissionValue] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState<SecuritiesWriteOffParameter | null>(
    null,
  );
  const [selectedAccount, setSelectedAccount] = useState<SecuritiesWriteOffAccount | null>(null);
  const [selectedMode, setSelectedMode] = useState<SecuritiesWriteOffMode | null>(null);
  const [contractorValue, setContractorValue] = useState('');
  const [selectedContractor, setSelectedContractor] = useState<SecuritiesContractor | null>(null);
  const [transferExpensesInfo, setTransferExpensesInfo] = useState(false);
  const [nonSbp, setNonSbp] = useState<SecuritiesWriteOffNonSbpDetails>(EMPTY_NON_SBP);
  const [openDateField, setOpenDateField] = useState<
    'dealDate' | 'settlementDate' | 'contractDate' | null
  >(null);
  const {
    data: writeOffParams,
    isLoading,
    isError: isParamsError,
  } = useGetSecuritiesWriteOffParamsQuery(undefined, { refetchOnMountOrArgChange: true });
  const isSbpMode = selectedMode?.code === 'SBP';
  const isNonSbpMode = Boolean(selectedMode) && !isSbpMode;
  const isWithRights = nonSbp.creditType === 'WITH_RIGHTS';
  const {
    data: contractorsData,
    isLoading: isContractorsLoading,
    isFetching: isContractorsFetching,
  } = useGetSecuritiesContractorsQuery(isSbpMode ? { sbp: true } : undefined, {
    refetchOnMountOrArgChange: true,
  });
  const [writeOff, { isLoading: isWriteOffLoading }] = useSecuritiesWriteOffMutation();
  const [getWriteOffDetails] = useLazyGetSecuritiesWriteOffQuery();
  const [getWriteOffFiles] = useLazyGetSecuritiesWriteOffFilesQuery();
  const [isStatusPolling, setIsStatusPolling] = useState(false);
  const [step, setStep] = useState<'FORM' | 'FAILED'>('FORM');
  const [errorMessage, setErrorMessage] = useState(DEFAULT_WRITEOFF_ERROR_MESSAGE);
  const [fieldErrors, setFieldErrors] = useState<WriteOffFieldErrors>({});
  const isNextBusy = isWriteOffLoading || isStatusPolling;

  const clearFieldError = (field: WriteOffFormField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }

      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const instruments = writeOffParams?.writeOffParameters ?? [];
  const contractors = contractorsData ?? [];
  const accounts = selectedInstrument?.accounts ?? [];
  const modes = selectedAccount?.modes ?? [];
  const emptyMessage = isLoading ? 'Загрузка...' : 'Ничего не найдено';
  const disclaimerTexts = (writeOffParams?.disclaimer ?? [])
    .map((item) => item?.text?.trim())
    .filter((text): text is string => Boolean(text));

  useEffect(() => {
    document.title = `${SECURITIES_WRITEOFF_PAGE_TITLE} — ${APP_TITLE}`;
  }, []);

  useEffect(() => {
    if (!writeOffParams) {
      return;
    }

    console.log('[SecuritiesWriteOff] raw response', writeOffParams);
    console.log(
      '[SecuritiesWriteOff] parsed fields',
      instruments.map((item) => ({
        instrument: item.name,
        isin: item.isin,
        iconSrc: getInstrumentIconSrc(item.instrumentImageName),
        accounts: item.accounts.map((account) => ({
          name: account.name,
          quantity: account.quantity,
          modes: account.modes.map((mode) => ({
            name: mode.name,
            comission: mode.comission,
            allowed: mode.allowed,
          })),
        })),
      })),
    );
  }, [writeOffParams, instruments]);

  useEffect(() => {
    if (!contractorsData) {
      return;
    }

    console.log('[SecuritiesWriteOff] contractors raw/parsed', contractorsData);
    console.log(
      '[SecuritiesWriteOff] contractors for SearchSelect',
      contractors.map((item, index) => ({
        id: item.id ?? `${item.name}-${index}`,
        value: item.name,
        fromField: 'name',
      })),
    );
  }, [contractorsData, contractors]);

  const instrumentList = useMemo(() => {
    const filtered = filterByQuery(instruments, instrumentValue, [
      'name',
      'isin',
      'issuerName',
    ]).map((instrument) => mapInstrumentToOption(instrument));

    if (
      selectedInstrument &&
      !filtered.some((item) => item.id === selectedInstrument.depoInstrumentId)
    ) {
      return [mapInstrumentToOption(selectedInstrument), ...filtered];
    }

    return filtered;
  }, [instruments, instrumentValue, selectedInstrument]);

  const accountList = useMemo(() => {
    const fractionPart = selectedInstrument?.quantityFractionPart;
    const normalizedQuery = accountValue.trim().toLowerCase();
    const filtered = (
      normalizedQuery
        ? accounts.filter((account) => account.name.toLowerCase().includes(normalizedQuery))
        : accounts
    ).map((account) => mapAccountToOption(account, fractionPart));

    if (selectedAccount && !filtered.some((item) => item.id === selectedAccount.depoSubAccountId)) {
      return [mapAccountToOption(selectedAccount, fractionPart), ...filtered];
    }

    return filtered;
  }, [accounts, accountValue, selectedAccount, selectedInstrument?.quantityFractionPart]);

  const modeList = useMemo(() => {
    const normalizedQuery = modeValue.trim().toLowerCase();
    const filtered = (
      normalizedQuery
        ? modes.filter((mode) => mode.name.toLowerCase().includes(normalizedQuery))
        : modes
    ).map((mode) => mapModeToOption(mode));

    if (selectedMode && !filtered.some((item) => item.id === selectedMode.code)) {
      return [mapModeToOption(selectedMode), ...filtered];
    }

    return filtered;
  }, [modes, modeValue, selectedMode]);

  const contractorList = useMemo(() => {
    const normalizedQuery = contractorValue.trim().toLowerCase();
    const filtered = (
      normalizedQuery
        ? contractors.filter((contractor) =>
            contractor.name.toLowerCase().includes(normalizedQuery),
          )
        : contractors
    ).map((contractor, index) => mapContractorToOption(contractor, index));

    if (selectedContractor && !filtered.some((item) => item.value === selectedContractor.name)) {
      return [mapContractorToOption(selectedContractor, -1), ...filtered];
    }

    return filtered;
  }, [contractors, contractorValue, selectedContractor]);

  const resetAccountAndBelow = () => {
    setSelectedAccount(null);
    setAccountValue('');
    setSelectedMode(null);
    setModeValue('');
    setQuantityValue('');
    setCommissionValue('');
  };

  const resetModeAndBelow = () => {
    setSelectedMode(null);
    setModeValue('');
    setCommissionValue('');
  };

  const patchNonSbp = (patch: Partial<SecuritiesWriteOffNonSbpDetails>) => {
    setNonSbp((prev) => ({ ...prev, ...patch }));
  };

  const selectInstrument = (instrument: SecuritiesWriteOffParameter | null) => {
    clearFieldError('instrument');
    setSelectedInstrument(instrument);
    setInstrumentValue(instrument?.name ?? '');
    setIsinValue(instrument?.isin ?? '');
    resetAccountAndBelow();
  };

  const selectAccount = (account: SecuritiesWriteOffAccount | null) => {
    clearFieldError('account');
    clearFieldError('quantity');
    setSelectedAccount(account);
    setAccountValue(account?.name ?? '');
    setQuantityValue(
      account != null
        ? formatQuantity(account.quantity, selectedInstrument?.quantityFractionPart)
        : '',
    );
    resetModeAndBelow();
  };

  const selectMode = (mode: SecuritiesWriteOffMode | null) => {
    clearFieldError('mode');
    setSelectedMode(mode);
    setModeValue(mode?.name ?? '');
    setCommissionValue(getDisplayCommission(mode, transferExpensesInfo));
    if (!mode || mode.code === 'SBP') {
      setNonSbp(EMPTY_NON_SBP);
    }
  };

  const selectContractor = (contractor: SecuritiesContractor | null) => {
    clearFieldError('contractor');
    setSelectedContractor(contractor);
    setContractorValue(contractor?.name ?? '');
    if (contractor) {
      clearFieldError('contractorID');
      clearFieldError('depoNumber');
      clearFieldError('depoDivision');
      patchNonSbp({
        contractorID: getContractorIdentifier(contractor),
        depoNumber: contractor.depoNumber ?? '',
        depoDivision: contractor.depoDivision ?? '',
      });
    }
  };

  useEffect(() => {
    if (instruments.length === 1 && !selectedInstrument) {
      selectInstrument(instruments[0]);
    }
  }, [instruments, selectedInstrument]);

  useEffect(() => {
    if (accounts.length !== 1 || selectedAccount) {
      return;
    }

    const [account] = accounts;
    if (account.allowed) {
      selectAccount(account);
    }
  }, [accounts, selectedAccount]);

  useEffect(() => {
    if (modes.length !== 1 || selectedMode) {
      return;
    }

    const [mode] = modes;
    if (mode.allowed) {
      selectMode(mode);
    }
  }, [modes, selectedMode]);

  useEffect(() => {
    if (contractors.length === 1 && !selectedContractor) {
      selectContractor(contractors[0]);
    }
  }, [contractors, selectedContractor]);

  useEffect(() => {
    if (!selectedContractor || contractors.length === 0) {
      return;
    }

    const isSelectedContractorAvailable = contractors.some(
      (contractor) =>
        (selectedContractor.id != null && contractor.id === selectedContractor.id) ||
        contractor.name === selectedContractor.name,
    );

    if (!isSelectedContractorAvailable) {
      selectContractor(null);
    }
  }, [contractors, selectedContractor]);

  const preventClearButtonFocus = (event: any) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[class*="Input-module_icon-clear"]')) {
      event.preventDefault();
    }
  };

  const clearSearchSelect = (clear: () => void) => () => {
    clear();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const maxQuantity = selectedAccount?.quantity ?? null;
  const quantityFractionPart = getQuantityFractionPart(selectedInstrument?.quantityFractionPart);
  const quantityNumber = toQuantityNumber(quantityValue);
  const isQuantityOverMax =
    quantityNumber != null && maxQuantity != null && quantityNumber > maxQuantity;
  const isQuantityNonPositive = quantityNumber != null && quantityNumber <= 0;
  const isQuantityError = isQuantityOverMax || isQuantityNonPositive;

  const handleQuantityValueChange = (values: NumberFormatValues) => {
    clearFieldError('quantity');
    setQuantityValue(normalizeQuantityFromNumberFormat(values, quantityFractionPart));
  };

  const handleQuantityBlur = () => {
    const parsed = toQuantityNumber(quantityValue);
    if (parsed == null) {
      return;
    }

    setQuantityValue(formatQuantity(parsed, quantityFractionPart));
  };

  const formPayload = useMemo(
    () => ({
      instrument: selectedInstrument
        ? {
            depoInstrumentId: selectedInstrument.depoInstrumentId,
            name: selectedInstrument.name,
            isin: selectedInstrument.isin,
            issuerName: selectedInstrument.issuerName,
            instrumentImageName: selectedInstrument.instrumentImageName,
          }
        : null,
      isin: isinValue,
      account: selectedAccount
        ? {
            depoSubAccountId: selectedAccount.depoSubAccountId,
            depoAccount: selectedAccount.depoAccount,
            name: selectedAccount.name,
            quantityAvailable: selectedAccount.quantity,
          }
        : null,
      mode: selectedMode
        ? {
            code: selectedMode.code,
            name: selectedMode.name,
            comission: selectedMode.comission,
            sendCostsComission: selectedMode.sendCostsComission,
            allowed: selectedMode.allowed,
          }
        : null,
      quantity: quantityValue,
      commission: commissionValue,
      contractor: selectedContractor
        ? {
            id: selectedContractor.id,
            name: selectedContractor.name,
          }
        : null,
      transferExpensesInfo,
      nonSbp: isNonSbpMode ? nonSbp : undefined,
    }),
    [
      selectedInstrument,
      isinValue,
      selectedAccount,
      selectedMode,
      quantityValue,
      commissionValue,
      selectedContractor,
      transferExpensesInfo,
      isNonSbpMode,
      nonSbp,
    ],
  );

  const handleBackClick = () => {
    navigate(ROUTE_TRANSFERS);
  };

  const handleLatinChange =
    (field: 'contractorID' | 'depoNumber' | 'depoDivision' | 'reference', max: number) =>
    (event: { target: { value: string } }) => {
      clearFieldError(field);
      patchNonSbp({ [field]: sanitizeLatin(event.target.value, max) });
    };

  const handleDateSubmit = (dates: Date[]) => {
    if (!openDateField || !dates?.[0]) {
      return;
    }

    const formatted = DateTime.fromJSDate(new Date(dates[0])).toFormat(DEFAULT_DATE_VIEW_FORMAT);
    clearFieldError(openDateField);
    if (openDateField === 'dealDate') {
      clearFieldError('settlementDate');
    }
    patchNonSbp({ [openDateField]: formatted });
    setOpenDateField(null);
  };

  const validateNonSbpFields = (): WriteOffFieldErrors => {
    if (!isNonSbpMode) {
      return {};
    }

    const errors: WriteOffFieldErrors = {};
    if (nonSbp.contractorID && nonSbp.contractorID.length < 3) {
      errors.contractorID = 'От 3 до 12 знаков, латинские буквы и цифры';
    }
    if (nonSbp.depoDivision && nonSbp.depoDivision.length < 6) {
      errors.depoDivision = 'От 6 до 17 знаков, латинские буквы и цифры';
    }

    const dealDate = parseFormDate(nonSbp.dealDate);
    const settlementDate = parseFormDate(nonSbp.settlementDate);
    if (dealDate && settlementDate && settlementDate < dealDate) {
      errors.settlementDate = 'Не может быть раньше даты сделки';
    }

    return errors;
  };

  const buildWriteOffRequest = (): SecuritiesWriteOffRequestParams => {
    const quantity = toQuantityNumber(formPayload.quantity);
    const contractorId = Number(formPayload.contractor?.id);
    const sbp = formPayload.mode == null ? null : formPayload.mode.code === 'SBP';
    const volume = toQuantityNumber(nonSbp.dealAmount);

    return {
      depoInstrument_Id: formPayload.instrument?.depoInstrumentId ?? null,
      depoSubAccount_Id: formPayload.account?.depoSubAccountId ?? null,
      quantity: quantity != null && quantity > 0 ? quantity : null,
      contractor_Id: Number.isFinite(contractorId) ? contractorId : null,
      sbp,
      sendCosts: formPayload.transferExpensesInfo,
      ...(sbp === false
        ? {
            contractorDepoAccount: nonSbp.depoNumber || null,
            contractorDepoSection: nonSbp.depoDivision || null,
            contractorID: nonSbp.contractorID || null,
            contractorAgreementNum: nonSbp.contractNumber || null,
            contractorAgreementDate: toIsoDate(nonSbp.contractDate),
            changeOwnership: nonSbp.creditType ? nonSbp.creditType === 'WITH_RIGHTS' : null,
            recipient: isWithRights ? nonSbp.supplierName || null : null,
            dealDate: toIsoDate(nonSbp.dealDate),
            settleDate: toIsoDate(nonSbp.settlementDate),
            reference: nonSbp.reference || null,
            volume: isWithRights && volume != null ? volume : null,
            comment: nonSbp.comment || null,
          }
        : {}),
    };
  };

  const applyCheckResultErrors = (payload: unknown) => {
    const errors = parseWriteOffCheckResult(
      (payload ?? {}) as SecuritiesWriteOffResponse | Record<string, unknown>,
    );

    if (!hasWriteOffFieldErrors(errors)) {
      return false;
    }

    console.log('[SecuritiesWriteOff] CheckResult field errors', errors);
    setFieldErrors(errors);
    return true;
  };

  const showFailed = (message = DEFAULT_WRITEOFF_ERROR_MESSAGE) => {
    setErrorMessage(message);
    setStep('FAILED');
  };

  const handleNextClick = async () => {
    if (isNextBusy) {
      return;
    }

    const nonSbpErrors = validateNonSbpFields();
    if (hasWriteOffFieldErrors(nonSbpErrors)) {
      setFieldErrors(nonSbpErrors);
      return;
    }

    const requestParams = buildWriteOffRequest();

    console.log('[SecuritiesWriteOff] POST /v1/nontrade/securities/writeoff', requestParams);
    setFieldErrors({});

    try {
      const response = await writeOff(requestParams).unwrap();
      console.log('[SecuritiesWriteOff] writeoff success', response);

      if (applyCheckResultErrors(response)) {
        return;
      }

      const requestGuid = getRequestGuidFromResponse(response);

      if (!requestGuid) {
        console.error('[SecuritiesWriteOff] requestGuid missing in POST response', response);
        showFailed();
        return;
      }

      setIsStatusPolling(true);

      let details;
      let status: SecuritiesWriteOffStatus | undefined;
      const pollDeadline = Date.now() + WRITEOFF_STATUS_POLL_TIMEOUT_MS;
      let attempt = 0;

      while (Date.now() <= pollDeadline) {
        attempt += 1;
        details = await getWriteOffDetails({ requestGuid }, false).unwrap();
        status = getWriteOffStatus(details);

        console.log('[SecuritiesWriteOff] GET /v1/nontrade/securities/writeoff status poll', {
          attempt,
          requestGuid,
          status,
          remainingMs: Math.max(0, pollDeadline - Date.now()),
          details,
        });

        if (isWriteOffStatusReady(status)) {
          break;
        }

        const remainingMs = pollDeadline - Date.now();
        if (remainingMs <= 0) {
          break;
        }

        await sleep(Math.min(WRITEOFF_STATUS_POLL_INTERVAL_MS, remainingMs));
      }

      if (!isWriteOffStatusReady(status) || !details) {
        showFailed();
        return;
      }

      if (status === 'waiting_iia_close') {
        console.log(
          '[SecuritiesWriteOff] status waiting_iia_close — нужна форма закрытия ИИС',
          details,
        );
        showFailed('Ожидается закрытие ИИС. Продолжение пока недоступно.');
        return;
      }

      if (!isWriteOffSigningStatus(status)) {
        showFailed();
        return;
      }

      console.log('[SecuritiesWriteOff] signing documents ready', {
        requestGuid,
        status,
        details,
      });

      console.log('[SecuritiesWriteOff] GET /v1/nontrade/securities/writeoff/files', {
        requestGuid,
      });

      const files = await getWriteOffFiles({ requestGuid }, false).unwrap();

      console.log('[SecuritiesWriteOff] writeoff/files response', files);

      if (!files.length) {
        showFailed('Не удалось получить список документов для подписания.');
        return;
      }

      navigate(ROUTE_SECURITIES_WRITEOFF_ORDER, {
        state: {
          formPayload: {
            ...formPayload,
            documentId: requestGuid,
          },
          requestGuid,
          writeOffDetails: details,
          writeOffStatus: status,
          referenceDocuments: files,
        },
      });
    } catch (error) {
      console.error('[SecuritiesWriteOff] writeoff error', error);

      const errorData =
        (error as { data?: unknown } | undefined)?.data ??
        (error as { error?: unknown } | undefined)?.error;

      if (applyCheckResultErrors(errorData)) {
        return;
      }

      showFailed(getWriteOffErrorMessage(error));
    } finally {
      setIsStatusPolling(false);
    }
  };

  if (step === 'FAILED') {
    return (
      <WriteOffFailed
        formPayload={formPayload}
        errorMessage={errorMessage}
        onRepeat={() => setStep('FORM')}
      />
    );
  }

  if (isParamsError) {
    return <BlockedContent type="errorInternalTransfer" />;
  }

  if (isLoading) {
    return (
      <div className={styles.loaderPage}>
        <CircleLoader brandColor size="large" />
      </div>
    );
  }

  if (isStatusPolling) {
    return (
      <div className={styles.loaderPage}>
        <CircleLoader brandColor size="large" />
        <Text>Обработка поручения...</Text>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {isMobile && (
        <HeaderPage
          title={SECURITIES_WRITEOFF_PAGE_TITLE}
          documentTitle={SECURITIES_WRITEOFF_PAGE_TITLE}
          leftIconVariant="back"
          onLeftIconClick={handleBackClick}
          showDivider
        />
      )}

      <div className={isMobile ? styles.wrapper : styles.wrapperDesktop}>
        {!isMobile && (
          <>
            <Text className={styles.pageTitle}>{SECURITIES_WRITEOFF_PAGE_TITLE}</Text>
            <Button
              className={styles.backButton}
              iconLeft={<BackSvg />}
              onClick={handleBackClick}
              shape="inline"
              variant="white"
            >
              <Text type="labelMedium">Назад</Text>
            </Button>
          </>
        )}

        <div className={styles.form} onMouseDownCapture={preventClearButtonFocus}>
          <SearchSelect
            label="Инструмент:"
            className={styles.sideField}
            classNameLabel={styles.sideFieldLabel}
            classNamePopover={styles.searchSelectPopover}
            classNameContent={styles.searchSelectDropdown}
            classNameDescription={styles.fieldHint}
            placeholder="Введите название"
            scale="small"
            searchIcon
            clearable
            list={instrumentList}
            value={instrumentValue}
            minChar={3}
            emptyMessage={emptyMessage}
            separatorActionCells={false}
            status={fieldErrors.instrument ? 'error' : null}
            description={fieldErrors.instrument}
            onChange={(event) => {
              clearFieldError('instrument');
              setInstrumentValue(event.target.value);
              setSelectedInstrument(null);
              setIsinValue('');
              resetAccountAndBelow();
            }}
            onClear={clearSearchSelect(() => selectInstrument(null))}
            onSelect={(item) => {
              const selected =
                instruments.find((instrument) => instrument.depoInstrumentId === item.id) ?? null;
              selectInstrument(selected);
            }}
          />
          <Input
            label="ISIN:"
            className={`${styles.sideField} ${styles.fieldMax400}`}
            classNameLabel={styles.sideFieldLabel}
            placeholder="ISIN"
            scale="small"
            value={isinValue}
            disabled
          />

          <Text className={styles.sectionTitle}>Списать</Text>
          <SearchSelect
            label="Счёт:"
            className={styles.sideField}
            classNameLabel={styles.sideFieldLabel}
            classNamePopover={styles.searchSelectPopover}
            classNameContent={styles.searchSelectDropdown}
            classNameDescription={styles.fieldHint}
            description={fieldErrors.account ?? ACCOUNT_HINT}
            status={fieldErrors.account ? 'error' : null}
            placeholder="Выберите счёт"
            scale="small"
            searchIcon
            clearable
            list={accountList}
            value={accountValue}
            minChar={3}
            emptyMessage={!selectedInstrument ? 'Сначала выберите инструмент' : 'Ничего не найдено'}
            separatorActionCells={false}
            onChange={(event) => {
              clearFieldError('account');
              setAccountValue(event.target.value);
              setSelectedAccount(null);
              setQuantityValue('');
              resetModeAndBelow();
            }}
            onClear={clearSearchSelect(() => selectAccount(null))}
            onSelect={(item) => {
              const selected =
                accounts.find((account) => account.depoSubAccountId === item.id) ?? null;
              selectAccount(selected);
            }}
          />
          <SearchSelect
            label="Способ:"
            className={styles.sideField}
            classNameLabel={styles.sideFieldLabel}
            classNamePopover={styles.searchSelectPopover}
            classNameContent={styles.searchSelectDropdown}
            classNameDescription={styles.fieldHint}
            placeholder="Выберите способ"
            scale="small"
            searchIcon
            clearable
            list={modeList}
            value={modeValue}
            minChar={3}
            emptyMessage={!selectedAccount ? 'Сначала выберите счёт' : 'Ничего не найдено'}
            separatorActionCells={false}
            status={fieldErrors.mode ? 'error' : null}
            description={fieldErrors.mode}
            onChange={(event) => {
              clearFieldError('mode');
              setModeValue(event.target.value);
              setSelectedMode(null);
              setCommissionValue('');
            }}
            onClear={clearSearchSelect(() => selectMode(null))}
            onSelect={(item) => {
              const selected = modes.find((mode) => mode.code === item.id) ?? null;
              selectMode(selected);
            }}
          />
          <Input
            label="Количество:"
            className={styles.sideField}
            classNameLabel={styles.sideFieldLabel}
            classNameDescription={styles.fieldHint}
            description={
              fieldErrors.quantity
                ? fieldErrors.quantity
                : isQuantityOverMax && maxQuantity != null
                ? `Максимум ${formatQuantity(maxQuantity, quantityFractionPart)} шт.`
                : isQuantityNonPositive
                ? 'Количество должно быть больше 0'
                : selectedAccount
                ? formatQuantityHint(selectedAccount.quantity, quantityFractionPart, 'Доступно') ??
                  'Доступно — шт.'
                : 'Доступно — шт.'
            }
            placeholder="0"
            scale="small"
            variant="number"
            precision={quantityFractionPart}
            decimalSeparator="."
            allowedDecimalSeparators={['.', ',']}
            thousandSeparator=""
            allowLeadingZeros={false}
            status={fieldErrors.quantity || isQuantityError ? 'error' : null}
            value={quantityValue}
            onValueChange={handleQuantityValueChange}
            onBlur={handleQuantityBlur}
          />
          <Input
            label="Комиссия:"
            className={`${styles.sideField} ${styles.fieldMax400}`}
            classNameLabel={styles.sideFieldLabel}
            scale="small"
            value={formatCommissionDisplay(commissionValue)}
            disabled
          />

          <Text className={styles.sectionTitle}>Зачислить</Text>
          <SearchSelect
            label="Контрагент:"
            className={styles.sideField}
            classNameLabel={styles.sideFieldLabel}
            classNamePopover={styles.searchSelectPopover}
            classNameContent={styles.searchSelectDropdown}
            classNameDescription={styles.fieldHint}
            placeholder="Выберите контрагента"
            scale="small"
            searchIcon
            clearable
            list={contractorList}
            value={contractorValue}
            minChar={3}
            emptyMessage={
              isContractorsLoading || isContractorsFetching ? 'Загрузка...' : 'Ничего не найдено'
            }
            separatorActionCells={false}
            status={fieldErrors.contractor ? 'error' : null}
            description={
              fieldErrors.contractor ?? (isNonSbpMode ? 'Наименование контрагента' : undefined)
            }
            onChange={(event) => {
              clearFieldError('contractor');
              setContractorValue(event.target.value);
              setSelectedContractor(null);
            }}
            onClear={clearSearchSelect(() => selectContractor(null))}
            onSelect={(item) => {
              const selected =
                contractors.find((contractor, index) => {
                  const optionId = contractor.id ?? `${contractor.name}-${index}`;
                  return optionId === item.id || contractor.name === item.value;
                }) ?? null;
              selectContractor(selected);
            }}
          />
          {isNonSbpMode && (
            <>
              <Input
                label="Идентификатор:"
                className={styles.sideField}
                classNameLabel={styles.sideFieldLabel}
                classNameDescription={styles.fieldHint}
                placeholder="Идентификатор или код"
                scale="small"
                value={nonSbp.contractorID}
                status={fieldErrors.contractorID ? 'error' : null}
                description={
                  fieldErrors.contractorID ??
                  'Идентификатор или код. От 3 до 12 знаков, латинские буквы и цифры'
                }
                onChange={handleLatinChange('contractorID', 12)}
              />
              <Input
                label="Номер счета:"
                className={styles.sideField}
                classNameLabel={styles.sideFieldLabel}
                classNameDescription={styles.fieldHint}
                placeholder="Номер счета депо"
                scale="small"
                value={nonSbp.depoNumber}
                status={fieldErrors.depoNumber ? 'error' : null}
                description={
                  fieldErrors.depoNumber ??
                  'Номер счета депо. От 1 до 12 знаков, латинские буквы и цифры'
                }
                onChange={handleLatinChange('depoNumber', 12)}
              />
              <Input
                label="Раздел счета:"
                className={styles.sideField}
                classNameLabel={styles.sideFieldLabel}
                classNameDescription={styles.fieldHint}
                placeholder="Раздел счета депо"
                scale="small"
                value={nonSbp.depoDivision}
                status={fieldErrors.depoDivision ? 'error' : null}
                description={
                  fieldErrors.depoDivision ??
                  'Раздел счета депо. От 6 до 17 знаков, латинские буквы и цифры'
                }
                onChange={handleLatinChange('depoDivision', 17)}
              />
              <SearchSelect
                label="Тип зачисления:"
                className={styles.sideField}
                classNameLabel={styles.sideFieldLabel}
                classNamePopover={styles.searchSelectPopover}
                classNameContent={styles.searchSelectDropdown}
                classNameDescription={styles.fieldHint}
                placeholder="Выберите тип зачисления"
                scale="small"
                clearable
                list={CREDIT_TYPE_OPTIONS}
                value={
                  CREDIT_TYPE_OPTIONS.find((item) => item.id === nonSbp.creditType)?.value ?? ''
                }
                minChar={0}
                emptyMessage="Ничего не найдено"
                separatorActionCells={false}
                status={fieldErrors.creditType ? 'error' : null}
                description={fieldErrors.creditType}
                onClear={clearSearchSelect(() => {
                  clearFieldError('creditType');
                  patchNonSbp({ creditType: '', supplierName: '', dealAmount: '' });
                })}
                onSelect={(item) => {
                  const creditType = item.id as WriteOffCreditType;
                  clearFieldError('creditType');
                  patchNonSbp({
                    creditType,
                    ...(creditType === 'WITH_RIGHTS' ? {} : { supplierName: '', dealAmount: '' }),
                  });
                }}
              />
              <Input
                label="Поставщик:"
                className={`${styles.sideField} ${styles.fieldMax400}`}
                classNameLabel={styles.sideFieldLabel}
                classNameDescription={styles.fieldHint}
                placeholder="ФИО поставщика ценных бумаг"
                scale="small"
                value={nonSbp.supplierName}
                disabled={!isWithRights}
                status={fieldErrors.supplierName ? 'error' : null}
                description={fieldErrors.supplierName ?? 'ФИО поставщика ценных бумаг'}
                onChange={(event) => {
                  clearFieldError('supplierName');
                  patchNonSbp({ supplierName: event.target.value });
                }}
              />
              <Text className={styles.sectionTitle}>Данные для зачисления</Text>
              <Input
                label="Сумма сделки:"
                className={styles.sideField}
                classNameLabel={styles.sideFieldLabel}
                classNameDescription={styles.fieldHint}
                placeholder="0"
                scale="small"
                variant="number"
                precision={2}
                decimalSeparator="."
                allowedDecimalSeparators={['.', ',']}
                thousandSeparator=""
                disabled={!isWithRights}
                status={fieldErrors.dealAmount ? 'error' : null}
                description={
                  fieldErrors.dealAmount ??
                  'Если зачисление производится на основании купли-продажи'
                }
                value={nonSbp.dealAmount}
                onValueChange={(values) => {
                  clearFieldError('dealAmount');
                  patchNonSbp({ dealAmount: values.value ?? '' });
                }}
              />
              <div onClick={() => setOpenDateField('dealDate')}>
                <Input
                  label="Дата сделки:"
                  className={styles.sideField}
                  classNameLabel={styles.sideFieldLabel}
                  classNameDescription={styles.fieldHint}
                  placeholder="Выберите дату"
                  scale="small"
                  value={nonSbp.dealDate}
                  addonAfter={<Calendar />}
                  readOnly
                  status={fieldErrors.dealDate ? 'error' : null}
                  description={
                    fieldErrors.dealDate ?? 'Должна совпадать с датой во встречном поручении'
                  }
                />
              </div>
              <div onClick={() => setOpenDateField('settlementDate')}>
                <Input
                  label="Дата расчетов:"
                  className={styles.sideField}
                  classNameLabel={styles.sideFieldLabel}
                  classNameDescription={styles.fieldHint}
                  placeholder="Выберите дату"
                  scale="small"
                  value={nonSbp.settlementDate}
                  addonAfter={<Calendar />}
                  readOnly
                  status={fieldErrors.settlementDate ? 'error' : null}
                  description={fieldErrors.settlementDate ?? 'Не может быть раньше даты сделки'}
                />
              </div>
              <Input
                label="Референс:"
                className={styles.sideField}
                classNameLabel={styles.sideFieldLabel}
                classNameDescription={styles.fieldHint}
                placeholder="Референс"
                scale="small"
                value={nonSbp.reference}
                status={fieldErrors.reference ? 'error' : null}
                description={fieldErrors.reference ?? 'До 16 знаков, латинские буквы и цифры'}
                onChange={handleLatinChange('reference', 16)}
              />
              <Text className={styles.sectionTitle}>Основание для зачисления</Text>
              <Input
                label="Номер договора:"
                className={styles.sideField}
                classNameLabel={styles.sideFieldLabel}
                classNameDescription={styles.fieldHint}
                placeholder="Номер договора"
                scale="small"
                value={nonSbp.contractNumber}
                status={fieldErrors.contractNumber ? 'error' : null}
                description={
                  fieldErrors.contractNumber ?? 'Номер депозитарного договора с контрагентом'
                }
                onChange={(event) => {
                  clearFieldError('contractNumber');
                  patchNonSbp({ contractNumber: event.target.value });
                }}
              />
              <div onClick={() => setOpenDateField('contractDate')}>
                <Input
                  label="Дата договора:"
                  className={styles.sideField}
                  classNameLabel={styles.sideFieldLabel}
                  classNameDescription={styles.fieldHint}
                  placeholder="Выберите дату"
                  scale="small"
                  value={nonSbp.contractDate}
                  addonAfter={<Calendar />}
                  readOnly
                  status={fieldErrors.contractDate ? 'error' : null}
                  description={
                    fieldErrors.contractDate ?? 'Дата депозитарного договора с контрагентом'
                  }
                />
              </div>
              <Text className={styles.sectionTitle}>Прочее</Text>
              <Input
                label="Примечание:"
                className={styles.sideField}
                classNameLabel={styles.sideFieldLabel}
                classNameDescription={styles.fieldHint}
                placeholder="Примечание"
                scale="small"
                value={nonSbp.comment}
                maxLength={250}
                status={fieldErrors.comment ? 'error' : null}
                description={fieldErrors.comment ?? 'До 250 символов'}
                onChange={(event) => {
                  clearFieldError('comment');
                  patchNonSbp({ comment: event.target.value.slice(0, 250) });
                }}
              />
            </>
          )}
          <Checkbox
            className={styles.expensesCheckbox}
            classNameLabel={styles.expensesCheckboxLabel}
            label="Передать контрагенту информацию о расходах, связанных с приобретением и хранением переводимых активов"
            checked={transferExpensesInfo}
            onChange={(event) => {
              const checked = event.target.checked;
              setTransferExpensesInfo(checked);
              setCommissionValue(getDisplayCommission(selectedMode, checked));
            }}
          />
          {disclaimerTexts.length > 0 && (
            <div className={styles.disclaimer}>
              {disclaimerTexts.map((text, index) => (
                <div key={`${index}-${text.slice(0, 24)}`} className={styles.disclaimerItem}>
                  {renderWriteOffHtml(text)}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <Button
            className={styles.navButton}
            iconRight={<ArrowNextIcon disabled={isNextBusy} />}
            onClick={handleNextClick}
            shape="inline"
            variant="white"
            disabled={isNextBusy}
          >
            <Text type="labelMedium">Далее</Text>
          </Button>
        </div>
      </div>

      <BottomSheet
        open={Boolean(openDateField)}
        onDismiss={() => setOpenDateField(null)}
        onTouchMove={(event) => event.stopPropagation()}
      >
        <DatePicker
          withPeriod={false}
          withOptions={false}
          minDate={
            openDateField === 'settlementDate'
              ? parseFormDate(nonSbp.dealDate)?.toJSDate()
              : undefined
          }
          onSubmit={handleDateSubmit}
        />
      </BottomSheet>
    </div>
  );
};

export default SecuritiesWriteOff;
