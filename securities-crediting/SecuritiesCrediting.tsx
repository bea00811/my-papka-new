import { useEffect, useMemo, useState } from 'react';
import { NumberFormatValues } from 'react-number-format';
import { useNavigate } from 'react-router-dom';

import {
  BottomSheet,
  Button,
  CircleLoader,
  DatePicker,
  Input,
  SearchSelect,
  Text,
} from '@aurora/components';
import { APP_TITLE, CDN_BASE_URL } from 'const/app';
import { DEFAULT_DATE_VIEW_FORMAT } from 'const/date';
import { ROUTE_SECURITIES_CREDITING_ORDER, ROUTE_TRANSFERS } from 'const/routes';
import { DateTime } from 'luxon';

import { isMobileDevice } from 'core/DeviceDetector';
import {
  useGetSecuritiesContractorsQuery,
  useGetSecuritiesCreditingParamsQuery,
  useGetSecuritiesDocTypesQuery,
  useGetSecuritiesWriteOffParamsQuery,
  useLazyGetSecuritiesCreditingFilesQuery,
  useLazyGetSecuritiesCreditingQuery,
  useSecuritiesCreditingMutation,
} from 'core/api/transfers';

import { SECURITIES_CREDITING_PAGE_TITLE } from 'modules/Transfers/constants';
import ArrowNextIcon from 'modules/Transfers/pages/Refill/icons/ArrowNextIcon';
import { SecuritiesContractor, SecuritiesWriteOffParameter } from 'modules/Transfers/types';
import {
  CreditingCreditType,
  SecuritiesCreditingAccount,
  SecuritiesCreditingFormDetails,
  SecuritiesCreditingParameter,
  SecuritiesCreditingRequestParams,
  SecuritiesCreditingResponse,
  SecuritiesCreditingSection,
} from 'modules/Transfers/types/securitiesCrediting';

import { HeaderPage } from 'components';
import { getSrc } from 'components/Instrument/components/InstrumentIcon/helpers';

import { ReactComponent as Calendar } from 'images/icons/calendarI.svg';
import { ReactComponent as BackSvg } from 'images/icons/glyphs/back.svg';

import BlockedContent from '../../components/BlockedContent';
import styles from './SecuritiesCrediting.module.pcss';
import SecurityIcon from './SecurityIcon';
import {
  CreditingFieldErrors,
  CreditingFormField,
  hasCreditingFieldErrors,
  parseCreditingCheckResult,
} from './creditingCheckResult';
import { DEFAULT_CREDITING_ERROR_MESSAGE, getCreditingErrorMessage } from './creditingErrors';
import {
  CREDITING_STATUS_POLL_INTERVAL_MS,
  CREDITING_STATUS_POLL_TIMEOUT_MS,
  getCreditingStatus,
  isCreditingSigningStatus,
  isCreditingStatusReady,
  sleep,
} from './creditingStatus';

const ACCOUNT_HINT = 'Счёт депо (депозитарий, номер договора)';
const LATIN_DIGIT_RE = /[^\dA-Za-z]/g;

const EMPTY_DETAILS: SecuritiesCreditingFormDetails = {
  contractorID: '',
  depoNumber: '',
  depoDivision: '',
  creditType: '',
  supplierName: '',
  dealAmount: '',
  dealDate: '',
  settlementDate: '',
  reference: '',
  docTypeId: null,
  docTypeOther: '',
  depoDocNum: '',
  depoDocDate: '',
  comment: '',
};

const CREDIT_TYPE_OPTIONS: Array<{ id: CreditingCreditType; value: string }> = [
  { id: 'WITH_RIGHTS', value: 'С переходом прав' },
  { id: 'WITHOUT_RIGHTS', value: 'Без перехода прав' },
];

type AccountOption = {
  depoSubAccountId: number;
  name: string;
  depoSection?: string;
};

const sanitizeLatin = (value: string, max: number) =>
  value.replace(LATIN_DIGIT_RE, '').slice(0, max);

const parseFormDate = (value: string) => {
  if (!value) return null;
  const parsed = DateTime.fromFormat(value, DEFAULT_DATE_VIEW_FORMAT);
  return parsed.isValid ? parsed : null;
};

const toIsoDate = (value: string) => parseFormDate(value)?.toISODate() ?? null;

const getContractorIdentifier = (contractor?: SecuritiesContractor | null) =>
  contractor?.contractorID ?? contractor?.contractorId ?? contractor?.depoIdentifier ?? '';

const getInstrumentIconSrc = (instrumentImageName?: string) =>
  instrumentImageName ? getSrc(CDN_BASE_URL, instrumentImageName) : undefined;

const getQuantityFractionPart = (fractionPart?: number) => {
  if (fractionPart == null || !Number.isFinite(fractionPart) || fractionPart < 0) return 0;
  return Math.floor(fractionPart);
};

const toQuantityNumber = (value: string) => {
  const normalized = value.trim().replace(',', '.');
  if (!normalized || normalized === '.') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeQuantityFromNumberFormat = (values: NumberFormatValues, fractionPart?: number) => {
  const digits = getQuantityFractionPart(fractionPart);
  const rawValue = (values.value ?? '').replace(',', '.');
  if (!rawValue) return '';
  if (digits > 0 && rawValue.endsWith('.')) {
    const intValue =
      values.floatValue != null && Number.isFinite(values.floatValue)
        ? String(Math.trunc(Math.abs(values.floatValue)))
        : '0';
    return `${intValue}.`;
  }
  const cleaned = rawValue.replace(/[^\d.]/g, '');
  const separatorIndex = cleaned.indexOf('.');
  const rawInteger =
    separatorIndex === -1 ? cleaned : cleaned.slice(0, separatorIndex).replace(/\D/g, '');
  const strippedInteger = rawInteger.replace(/^0+/, '');
  const integerPart = strippedInteger === '' ? (rawInteger.length > 0 ? '0' : '') : strippedInteger;
  if (digits === 0 || separatorIndex === -1) return integerPart;
  const fractionValue = cleaned
    .slice(separatorIndex + 1)
    .replace(/\D/g, '')
    .slice(0, digits);
  return `${integerPart || '0'}.${fractionValue}`;
};

const normalizeCreditingRows = (raw: unknown): SecuritiesCreditingParameter[] => {
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Record<string, unknown>;
  const list =
    (record.creditingParameters as unknown[]) ??
    (record.CreditingParameters as unknown[]) ??
    (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(list)) return [];

  return list.map((row) => {
    const item = row as Record<string, unknown>;
    const accountsRaw = (item.accounts ?? item.Accounts ?? []) as Array<Record<string, unknown>>;
    const accounts: SecuritiesCreditingAccount[] = accountsRaw.map((acc) => {
      const sectionsRaw = (acc.sections ?? acc.Sections ?? []) as Array<Record<string, unknown>>;
      const sections: SecuritiesCreditingSection[] = sectionsRaw.map((section) => ({
        depoSection: String(section.depoSection ?? section.DepoSection ?? ''),
        depoSubAccountId: Number(section.depoSubAccount_Id ?? section.depoSubAccountId ?? 0),
      }));
      return {
        agreement: String(acc.agreement ?? acc.Agreement ?? ''),
        depoAccount: String(acc.depoAccount ?? acc.DepoAccount ?? ''),
        sections,
      };
    });

    return {
      depo: String(item.depo ?? item.Depo ?? ''),
      name: String(item.name ?? item.Name ?? item.depo ?? item.Depo ?? ''),
      accounts,
      changeOwnershipAllowed: Boolean(
        item.changeOwnershipAllowed ?? item.ChangeOwnershipAllowed ?? true,
      ),
    };
  });
};

const flattenAccounts = (depo: SecuritiesCreditingParameter | null): AccountOption[] => {
  if (!depo) return [];
  return depo.accounts.flatMap((account) => {
    if (!account.sections.length) {
      return [
        {
          depoSubAccountId: 0,
          name: [account.agreement, account.depoAccount].filter(Boolean).join(' · '),
        },
      ];
    }
    return account.sections.map((section) => ({
      depoSubAccountId: section.depoSubAccountId,
      name: [account.agreement, account.depoAccount, section.depoSection]
        .filter(Boolean)
        .join(' · '),
      depoSection: section.depoSection,
    }));
  });
};

const mapInstrumentToOption = (instrument: SecuritiesWriteOffParameter) => ({
  id: instrument.depoInstrumentId,
  value: instrument.name,
  description: [instrument.instrumentShortType, instrument.issuerName, instrument.isin]
    .filter(Boolean)
    .join(' · '),
  iconLeft: (
    <SecurityIcon
      src={getInstrumentIconSrc(instrument.instrumentImageName)}
      alt={instrument.name}
    />
  ),
});

const mapContractorToOption = (contractor: SecuritiesContractor, index: number) => ({
  id: contractor.id ?? `${contractor.name}-${index}`,
  value: contractor.name,
});

const filterByQuery = <T,>(items: T[], query: string, fields: Array<keyof T>) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) =>
    fields.some((field) => String(item[field] ?? '').toLowerCase().includes(normalized)),
  );
};

const clearSearchSelect = (fn: () => void) => () => fn();

const preventClearButtonFocus = (event: React.MouseEvent) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest?.('[data-clear], .clear, button[aria-label="Clear"]')) {
    event.preventDefault();
  }
};

const getRequestGuidFromResponse = (response: SecuritiesCreditingResponse) => {
  const list = response.request ?? response.Request ?? [];
  const first = list[0];
  return first?.requestGuid ?? first?.RequestGuid ?? null;
};

const SecuritiesCrediting = () => {
  const navigate = useNavigate();
  const isMobile = isMobileDevice();

  const [selectedInstrument, setSelectedInstrument] = useState<SecuritiesWriteOffParameter | null>(
    null,
  );
  const [instrumentValue, setInstrumentValue] = useState('');
  const [isinValue, setIsinValue] = useState('');
  const [selectedDepo, setSelectedDepo] = useState<SecuritiesCreditingParameter | null>(null);
  const [depoValue, setDepoValue] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<AccountOption | null>(null);
  const [accountValue, setAccountValue] = useState('');
  const [quantityValue, setQuantityValue] = useState('');
  const [selectedContractor, setSelectedContractor] = useState<SecuritiesContractor | null>(null);
  const [contractorValue, setContractorValue] = useState('');
  const [details, setDetails] = useState<SecuritiesCreditingFormDetails>(EMPTY_DETAILS);
  const [openDateField, setOpenDateField] = useState<
    'dealDate' | 'settlementDate' | 'depoDocDate' | null
  >(null);
  const [fieldErrors, setFieldErrors] = useState<CreditingFieldErrors>({});
  const [step, setStep] = useState<'FORM' | 'FAILED'>('FORM');
  const [errorMessage, setErrorMessage] = useState(DEFAULT_CREDITING_ERROR_MESSAGE);
  const [isStatusPolling, setIsStatusPolling] = useState(false);

  const isWithRights = details.creditType === 'WITH_RIGHTS';
  const changeOwnershipParam =
    details.creditType === 'WITH_RIGHTS'
      ? true
      : details.creditType === 'WITHOUT_RIGHTS'
      ? false
      : undefined;

  // ponytail: instrument catalog from writeoff/params until crediting has its own
  const {
    data: writeOffParams,
    isLoading: isInstrumentsLoading,
    isError: isInstrumentsError,
  } = useGetSecuritiesWriteOffParamsQuery(undefined, { refetchOnMountOrArgChange: true });

  const {
    data: creditingParamsRaw,
    isLoading: isCreditingParamsLoading,
    isFetching: isCreditingParamsFetching,
  } = useGetSecuritiesCreditingParamsQuery(
    selectedInstrument
      ? { depoInstrument_Id: selectedInstrument.depoInstrumentId }
      : undefined,
    { skip: !selectedInstrument, refetchOnMountOrArgChange: true },
  );

  const { data: contractorsData, isLoading: isContractorsLoading } =
    useGetSecuritiesContractorsQuery(undefined, { refetchOnMountOrArgChange: true });

  const { data: docTypes = [] } = useGetSecuritiesDocTypesQuery(
    changeOwnershipParam === undefined ? undefined : { changeOwnership: changeOwnershipParam },
    { skip: changeOwnershipParam === undefined },
  );

  const [crediting, { isLoading: isCreditingLoading }] = useSecuritiesCreditingMutation();
  const [getCreditingDetails] = useLazyGetSecuritiesCreditingQuery();
  const [getCreditingFiles] = useLazyGetSecuritiesCreditingFilesQuery();

  const instruments = writeOffParams?.writeOffParameters ?? [];
  const contractors = contractorsData ?? [];
  const depos = useMemo(() => normalizeCreditingRows(creditingParamsRaw), [creditingParamsRaw]);
  const accounts = useMemo(() => flattenAccounts(selectedDepo), [selectedDepo]);
  const quantityFractionPart = getQuantityFractionPart(selectedInstrument?.quantityFractionPart);
  const emptyMessage = isInstrumentsLoading ? 'Загрузка...' : 'Ничего не найдено';
  const isNextBusy = isCreditingLoading || isStatusPolling;
  const isWithRightsBlocked = selectedDepo != null && !selectedDepo.changeOwnershipAllowed;

  const clearFieldError = (field: CreditingFormField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const patchDetails = (patch: Partial<SecuritiesCreditingFormDetails>) => {
    setDetails((prev) => ({ ...prev, ...patch }));
  };

  useEffect(() => {
    document.title = `${SECURITIES_CREDITING_PAGE_TITLE} — ${APP_TITLE}`;
  }, []);

  const instrumentList = useMemo(() => {
    const filtered = filterByQuery(instruments, instrumentValue, [
      'name',
      'isin',
      'issuerName',
    ]).map(mapInstrumentToOption);
    if (
      selectedInstrument &&
      !filtered.some((item) => item.id === selectedInstrument.depoInstrumentId)
    ) {
      return [mapInstrumentToOption(selectedInstrument), ...filtered];
    }
    return filtered;
  }, [instruments, instrumentValue, selectedInstrument]);

  const depoList = useMemo(() => {
    const normalizedQuery = depoValue.trim().toLowerCase();
    const filtered = (
      normalizedQuery
        ? depos.filter(
            (item) =>
              item.name.toLowerCase().includes(normalizedQuery) ||
              item.depo.toLowerCase().includes(normalizedQuery),
          )
        : depos
    ).map((item) => ({ id: item.depo, value: item.name }));
    if (selectedDepo && !filtered.some((item) => item.id === selectedDepo.depo)) {
      return [{ id: selectedDepo.depo, value: selectedDepo.name }, ...filtered];
    }
    return filtered;
  }, [depos, depoValue, selectedDepo]);

  const accountList = useMemo(() => {
    const normalizedQuery = accountValue.trim().toLowerCase();
    const filtered = (
      normalizedQuery
        ? accounts.filter((account) => account.name.toLowerCase().includes(normalizedQuery))
        : accounts
    ).map((account) => ({ id: account.depoSubAccountId, value: account.name }));
    if (selectedAccount && !filtered.some((item) => item.id === selectedAccount.depoSubAccountId)) {
      return [{ id: selectedAccount.depoSubAccountId, value: selectedAccount.name }, ...filtered];
    }
    return filtered;
  }, [accounts, accountValue, selectedAccount]);

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

  const docTypeList = useMemo(
    () => docTypes.map((item) => ({ id: item.id, value: item.name })),
    [docTypes],
  );

  const selectedDocType = docTypes.find((item) => item.id === details.docTypeId) ?? null;

  const resetBelowInstrument = () => {
    setSelectedDepo(null);
    setDepoValue('');
    setSelectedAccount(null);
    setAccountValue('');
    setQuantityValue('');
  };

  const selectInstrument = (instrument: SecuritiesWriteOffParameter | null) => {
    clearFieldError('instrument');
    setSelectedInstrument(instrument);
    setInstrumentValue(instrument?.name ?? '');
    setIsinValue(instrument?.isin ?? '');
    resetBelowInstrument();
  };

  const selectDepo = (depo: SecuritiesCreditingParameter | null) => {
    clearFieldError('depo');
    setSelectedDepo(depo);
    setDepoValue(depo?.name ?? '');
    setSelectedAccount(null);
    setAccountValue('');
    if (depo && !depo.changeOwnershipAllowed && details.creditType === 'WITH_RIGHTS') {
      patchDetails({ creditType: '', supplierName: '', dealAmount: '' });
    }
  };

  const selectAccount = (account: AccountOption | null) => {
    clearFieldError('account');
    clearFieldError('quantity');
    setSelectedAccount(account);
    setAccountValue(account?.name ?? '');
  };

  const selectContractor = (contractor: SecuritiesContractor | null) => {
    clearFieldError('contractor');
    setSelectedContractor(contractor);
    setContractorValue(contractor?.name ?? '');
    if (contractor) {
      clearFieldError('contractorID');
      clearFieldError('depoNumber');
      clearFieldError('depoDivision');
      patchDetails({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruments, selectedInstrument]);

  useEffect(() => {
    if (depos.length === 1 && !selectedDepo) {
      selectDepo(depos[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depos, selectedDepo]);

  useEffect(() => {
    if (accounts.length === 1 && !selectedAccount) {
      selectAccount(accounts[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, selectedAccount]);

  const handleLatinChange =
    (field: 'contractorID' | 'depoNumber' | 'depoDivision' | 'reference', max: number) =>
    (event: { target: { value: string } }) => {
      clearFieldError(field);
      patchDetails({ [field]: sanitizeLatin(event.target.value, max) });
    };

  const handleDateSubmit = (dates: Date[]) => {
    if (!openDateField || !dates?.[0]) return;
    const formatted = DateTime.fromJSDate(new Date(dates[0])).toFormat(DEFAULT_DATE_VIEW_FORMAT);
    clearFieldError(openDateField);
    if (openDateField === 'dealDate') clearFieldError('settlementDate');
    patchDetails({ [openDateField]: formatted });
    setOpenDateField(null);
  };

  const handleQuantityValueChange = (values: NumberFormatValues) => {
    clearFieldError('quantity');
    setQuantityValue(normalizeQuantityFromNumberFormat(values, quantityFractionPart));
  };

  const validateLocal = (): CreditingFieldErrors => {
    const errors: CreditingFieldErrors = {};
    if (details.contractorID && details.contractorID.length < 3) {
      errors.contractorID = 'От 3 до 12 знаков, латинские буквы и цифры';
    }
    if (details.depoDivision && details.depoDivision.length < 6) {
      errors.depoDivision = 'От 6 до 17 знаков, латинские буквы и цифры';
    }
    const dealDate = parseFormDate(details.dealDate);
    const settlementDate = parseFormDate(details.settlementDate);
    if (dealDate && settlementDate && settlementDate < dealDate) {
      errors.settlementDate = 'Не может быть раньше даты сделки';
    }
    return errors;
  };

  const buildRequest = (): SecuritiesCreditingRequestParams => {
    const quantity = toQuantityNumber(quantityValue);
    const contractorId = Number(selectedContractor?.id);
    const volume = toQuantityNumber(details.dealAmount);

    return {
      depoInstrument_Id: selectedInstrument?.depoInstrumentId ?? null,
      depoSubAccount_Id: selectedAccount?.depoSubAccountId || null,
      quantity: quantity != null && quantity > 0 ? quantity : null,
      contractor_Id: Number.isFinite(contractorId) ? contractorId : null,
      contractorDepoAccount: details.depoNumber || null,
      contractorDepoSection: details.depoDivision || null,
      contractorID: details.contractorID || null,
      depoDocType_Id: details.docTypeId,
      depoDocTypeOther: selectedDocType?.needComment ? details.docTypeOther || null : null,
      depoDocNum: details.depoDocNum || null,
      depoDocDate: toIsoDate(details.depoDocDate),
      changeOwnership: details.creditType ? details.creditType === 'WITH_RIGHTS' : null,
      supplier: isWithRights ? details.supplierName || null : null,
      dealDate: toIsoDate(details.dealDate),
      settleDate: toIsoDate(details.settlementDate),
      reference: details.reference || null,
      volume: isWithRights && volume != null ? volume : null,
      comment: details.comment || null,
    };
  };

  const applyCheckResultErrors = (payload: unknown) => {
    const errors = parseCreditingCheckResult(
      (payload ?? {}) as SecuritiesCreditingResponse | Record<string, unknown>,
    );
    if (!hasCreditingFieldErrors(errors)) return false;
    setFieldErrors(errors);
    return true;
  };

  const showFailed = (message = DEFAULT_CREDITING_ERROR_MESSAGE) => {
    setErrorMessage(message);
    setStep('FAILED');
  };

  const handleNextClick = async () => {
    if (isNextBusy) return;

    const localErrors = validateLocal();
    if (hasCreditingFieldErrors(localErrors)) {
      setFieldErrors(localErrors);
      return;
    }

    const requestParams = buildRequest();
    setFieldErrors({});

    try {
      const response = await crediting(requestParams).unwrap();
      if (applyCheckResultErrors(response)) return;

      const requestGuid = getRequestGuidFromResponse(response);
      if (!requestGuid) {
        showFailed();
        return;
      }

      setIsStatusPolling(true);
      let detailsResponse;
      let status: string | undefined;
      const pollDeadline = Date.now() + CREDITING_STATUS_POLL_TIMEOUT_MS;
      let attempt = 0;

      while (Date.now() <= pollDeadline) {
        attempt += 1;
        detailsResponse = await getCreditingDetails({ requestGuid }, false).unwrap();
        status = getCreditingStatus(detailsResponse);
        console.log('[SecuritiesCrediting] status poll', { attempt, requestGuid, status });

        if (isCreditingStatusReady(status)) break;

        const remainingMs = pollDeadline - Date.now();
        if (remainingMs <= 0) break;
        await sleep(Math.min(CREDITING_STATUS_POLL_INTERVAL_MS, remainingMs));
      }

      if (!isCreditingStatusReady(status) || !detailsResponse) {
        showFailed();
        return;
      }

      if (!isCreditingSigningStatus(status)) {
        showFailed();
        return;
      }

      const files = await getCreditingFiles({ requestGuid }, false).unwrap();
      if (!files.length) {
        showFailed('Не удалось получить список документов для подписания.');
        return;
      }

      navigate(ROUTE_SECURITIES_CREDITING_ORDER, {
        state: {
          formPayload: {
            instrument: selectedInstrument
              ? {
                  depoInstrumentId: selectedInstrument.depoInstrumentId,
                  name: selectedInstrument.name,
                  isin: selectedInstrument.isin,
                }
              : null,
            quantity: quantityValue,
            contractor: selectedContractor
              ? { id: selectedContractor.id, name: selectedContractor.name }
              : null,
            documentId: requestGuid,
          },
          requestGuid,
          creditingDetails: detailsResponse,
          creditingStatus: status,
          referenceDocuments: files,
        },
      });
    } catch (error) {
      const errorData =
        (error as { data?: unknown } | undefined)?.data ??
        (error as { error?: unknown } | undefined)?.error;
      if (applyCheckResultErrors(errorData)) return;
      showFailed(getCreditingErrorMessage(error));
    } finally {
      setIsStatusPolling(false);
    }
  };

  if (step === 'FAILED') {
    return (
      <div className={styles.page}>
        <Text>{errorMessage}</Text>
        <Button onClick={() => setStep('FORM')} shape="inline" variant="white">
          <Text type="labelMedium">Повторить</Text>
        </Button>
      </div>
    );
  }

  if (isInstrumentsError) {
    return <BlockedContent type="errorInternalTransfer" />;
  }

  if (isInstrumentsLoading) {
    return (
      <div className={styles.loaderPage}>
        <CircleLoader brandColor size="large" />
      </div>
    );
  }

  if (isStatusPolling || isCreditingLoading) {
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
          title={SECURITIES_CREDITING_PAGE_TITLE}
          documentTitle={SECURITIES_CREDITING_PAGE_TITLE}
          leftIconVariant="back"
          onLeftIconClick={() => navigate(ROUTE_TRANSFERS)}
          showDivider
        />
      )}

      <div className={isMobile ? styles.wrapper : styles.wrapperDesktop}>
        {!isMobile && (
          <>
            <Text className={styles.pageTitle}>{SECURITIES_CREDITING_PAGE_TITLE}</Text>
            <Button
              className={styles.backButton}
              iconLeft={<BackSvg />}
              onClick={() => navigate(ROUTE_TRANSFERS)}
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
              resetBelowInstrument();
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

          <Text className={styles.sectionTitle}>Куда зачислить</Text>
          <SearchSelect
            label="Место расчетов:"
            className={styles.sideField}
            classNameLabel={styles.sideFieldLabel}
            classNamePopover={styles.searchSelectPopover}
            classNameContent={styles.searchSelectDropdown}
            classNameDescription={styles.fieldHint}
            placeholder="Выберите место расчетов"
            scale="small"
            searchIcon
            clearable
            list={depoList}
            value={depoValue}
            minChar={0}
            emptyMessage={
              !selectedInstrument
                ? 'Сначала выберите инструмент'
                : isCreditingParamsLoading || isCreditingParamsFetching
                ? 'Загрузка...'
                : 'Ничего не найдено'
            }
            separatorActionCells={false}
            status={fieldErrors.depo ? 'error' : null}
            description={fieldErrors.depo}
            onChange={(event) => {
              clearFieldError('depo');
              setDepoValue(event.target.value);
              setSelectedDepo(null);
              setSelectedAccount(null);
              setAccountValue('');
            }}
            onClear={clearSearchSelect(() => selectDepo(null))}
            onSelect={(item) => {
              const selected = depos.find((depo) => depo.depo === item.id) ?? null;
              selectDepo(selected);
            }}
          />
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
            minChar={0}
            emptyMessage={!selectedDepo ? 'Сначала выберите место расчетов' : 'Ничего не найдено'}
            separatorActionCells={false}
            onChange={(event) => {
              clearFieldError('account');
              setAccountValue(event.target.value);
              setSelectedAccount(null);
            }}
            onClear={clearSearchSelect(() => selectAccount(null))}
            onSelect={(item) => {
              const selected =
                accounts.find((account) => account.depoSubAccountId === item.id) ?? null;
              selectAccount(selected);
            }}
          />
          <Input
            label="Количество:"
            className={styles.sideField}
            classNameLabel={styles.sideFieldLabel}
            classNameDescription={styles.fieldHint}
            description={fieldErrors.quantity}
            placeholder="0"
            scale="small"
            variant="number"
            precision={quantityFractionPart}
            decimalSeparator="."
            allowedDecimalSeparators={['.', ',']}
            thousandSeparator=""
            allowLeadingZeros={false}
            status={fieldErrors.quantity ? 'error' : null}
            value={quantityValue}
            onValueChange={handleQuantityValueChange}
          />
          <Input
            label="Комиссия:"
            className={`${styles.sideField} ${styles.fieldMax400}`}
            classNameLabel={styles.sideFieldLabel}
            scale="small"
            value=""
            disabled
            description="— "
          />

          <Text className={styles.sectionTitle}>Откуда списать</Text>
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
            emptyMessage={isContractorsLoading ? 'Загрузка...' : 'Ничего не найдено'}
            separatorActionCells={false}
            status={fieldErrors.contractor ? 'error' : null}
            description={fieldErrors.contractor ?? 'Наименование контрагента'}
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
          <Input
            label="Идентификатор:"
            className={styles.sideField}
            classNameLabel={styles.sideFieldLabel}
            classNameDescription={styles.fieldHint}
            placeholder="Идентификатор или код"
            scale="small"
            value={details.contractorID}
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
            value={details.depoNumber}
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
            value={details.depoDivision}
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
            list={
              isWithRightsBlocked
                ? CREDIT_TYPE_OPTIONS.filter((item) => item.id !== 'WITH_RIGHTS')
                : CREDIT_TYPE_OPTIONS
            }
            value={CREDIT_TYPE_OPTIONS.find((item) => item.id === details.creditType)?.value ?? ''}
            minChar={0}
            emptyMessage="Ничего не найдено"
            separatorActionCells={false}
            status={fieldErrors.creditType ? 'error' : null}
            description={fieldErrors.creditType}
            onClear={clearSearchSelect(() => {
              clearFieldError('creditType');
              patchDetails({
                creditType: '',
                supplierName: '',
                dealAmount: '',
                docTypeId: null,
                docTypeOther: '',
              });
            })}
            onSelect={(item) => {
              const creditType = item.id as CreditingCreditType;
              clearFieldError('creditType');
              patchDetails({
                creditType,
                docTypeId: null,
                docTypeOther: '',
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
            value={details.supplierName}
            disabled={!isWithRights}
            status={fieldErrors.supplierName ? 'error' : null}
            description={fieldErrors.supplierName ?? 'ФИО поставщика ценных бумаг'}
            onChange={(event) => {
              clearFieldError('supplierName');
              patchDetails({ supplierName: event.target.value });
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
              fieldErrors.dealAmount ?? 'Если зачисление производится на основании купли-продажи'
            }
            value={details.dealAmount}
            onValueChange={(values) => {
              clearFieldError('dealAmount');
              patchDetails({ dealAmount: values.value ?? '' });
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
              value={details.dealDate}
              addonAfter={<Calendar />}
              readOnly
              status={fieldErrors.dealDate ? 'error' : null}
              description={fieldErrors.dealDate ?? 'Должна совпадать с датой во встречном поручении'}
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
              value={details.settlementDate}
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
            value={details.reference}
            status={fieldErrors.reference ? 'error' : null}
            description={fieldErrors.reference ?? 'До 16 знаков, латинские буквы и цифры'}
            onChange={handleLatinChange('reference', 16)}
          />

          <Text className={styles.sectionTitle}>Основание для зачисления</Text>
          <SearchSelect
            label="Тип документа:"
            className={styles.sideField}
            classNameLabel={styles.sideFieldLabel}
            classNamePopover={styles.searchSelectPopover}
            classNameContent={styles.searchSelectDropdown}
            classNameDescription={styles.fieldHint}
            placeholder="Выберите тип документа"
            scale="small"
            clearable
            list={docTypeList}
            value={selectedDocType?.name ?? ''}
            minChar={0}
            emptyMessage={
              !details.creditType ? 'Сначала выберите тип зачисления' : 'Ничего не найдено'
            }
            separatorActionCells={false}
            status={fieldErrors.docTypeId ? 'error' : null}
            description={fieldErrors.docTypeId}
            disabled={!details.creditType}
            onClear={clearSearchSelect(() => {
              clearFieldError('docTypeId');
              patchDetails({ docTypeId: null, docTypeOther: '' });
            })}
            onSelect={(item) => {
              clearFieldError('docTypeId');
              patchDetails({ docTypeId: Number(item.id), docTypeOther: '' });
            }}
          />
          {selectedDocType?.needComment && (
            <Input
              label="Иной тип:"
              className={styles.sideField}
              classNameLabel={styles.sideFieldLabel}
              classNameDescription={styles.fieldHint}
              placeholder="Укажите тип документа"
              scale="small"
              value={details.docTypeOther}
              status={fieldErrors.docTypeOther ? 'error' : null}
              description={fieldErrors.docTypeOther}
              onChange={(event) => {
                clearFieldError('docTypeOther');
                patchDetails({ docTypeOther: event.target.value });
              }}
            />
          )}
          <Input
            label="Номер докум.:"
            className={styles.sideField}
            classNameLabel={styles.sideFieldLabel}
            classNameDescription={styles.fieldHint}
            placeholder="Номер документа"
            scale="small"
            value={details.depoDocNum}
            status={fieldErrors.depoDocNum ? 'error' : null}
            description={fieldErrors.depoDocNum}
            onChange={(event) => {
              clearFieldError('depoDocNum');
              patchDetails({ depoDocNum: event.target.value });
            }}
          />
          <div onClick={() => setOpenDateField('depoDocDate')}>
            <Input
              label="Дата докум.:"
              className={styles.sideField}
              classNameLabel={styles.sideFieldLabel}
              classNameDescription={styles.fieldHint}
              placeholder="Выберите дату"
              scale="small"
              value={details.depoDocDate}
              addonAfter={<Calendar />}
              readOnly
              status={fieldErrors.depoDocDate ? 'error' : null}
              description={fieldErrors.depoDocDate}
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
            value={details.comment}
            maxLength={250}
            status={fieldErrors.comment ? 'error' : null}
            description={fieldErrors.comment ?? 'До 250 символов'}
            onChange={(event) => {
              clearFieldError('comment');
              patchDetails({ comment: event.target.value.slice(0, 250) });
            }}
          />
          {/* ponytail: supporting docs — copy WriteOffSupportingDocuments and wire upload/commit when needed */}
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
              ? parseFormDate(details.dealDate)?.toJSDate()
              : undefined
          }
          onSubmit={handleDateSubmit}
        />
      </BottomSheet>
    </div>
  );
};

export default SecuritiesCrediting;
