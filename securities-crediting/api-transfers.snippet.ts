/**
 * Вставить в src/core/api/transfers.ts рядом с writeoff-эндпоинтами.
 * Импорты констант и типов — см. APPLY.md.
 */

/*
    getSecuritiesCreditingParams: builder.query<
      SecuritiesCreditingParamsResponse,
      { depoInstrument_Id: number; contractorDepoAccount?: string } | void
    >({
      keepUnusedDataFor: 0,
      query: (params) => ({
        url: API_REQUEST_SECURITIES_CREDITING_PARAMS,
        params: params?.depoInstrument_Id
          ? {
              depoInstrument_Id: params.depoInstrument_Id,
              ...(params.contractorDepoAccount
                ? { contractorDepoAccount: params.contractorDepoAccount }
                : {}),
            }
          : undefined,
      }),
      transformResponse: (data: SecuritiesCreditingParamsResponse | Record<string, unknown>) => {
        if (!data || typeof data !== 'object') {
          return { creditingParameters: [] };
        }
        const record = data as Record<string, unknown>;
        const list =
          (record.creditingParameters as unknown[]) ??
          (record.CreditingParameters as unknown[]) ??
          (record.data as unknown[]) ??
          (Array.isArray(data) ? data : null);

        return {
          ...(data as object),
          creditingParameters: Array.isArray(list) ? list : [],
        } as SecuritiesCreditingParamsResponse;
      },
    }),

    securitiesCrediting: builder.mutation<
      SecuritiesCreditingResponse,
      SecuritiesCreditingRequestParams
    >({
      query: (body) => ({
        url: API_REQUEST_SECURITIES_CREDITING,
        method: 'POST',
        body,
      }),
    }),

    getSecuritiesCrediting: builder.query<
      SecuritiesCreditingStatusDetails,
      { requestGuid: string }
    >({
      query: ({ requestGuid }) => ({
        url: API_REQUEST_SECURITIES_CREDITING,
        params: { requestGuid },
      }),
    }),

    getSecuritiesCreditingFiles: builder.query<
      Array<{ type?: string; Type?: string; displayName?: string; DisplayName?: string }>,
      { requestGuid: string }
    >({
      keepUnusedDataFor: 0,
      query: ({ requestGuid }) => ({
        url: API_REQUEST_SECURITIES_CREDITING_FILES,
        params: { requestGuid },
      }),
      transformResponse: (data: Record<string, unknown> | unknown[]) => {
        if (Array.isArray(data)) return data;
        const record = data as Record<string, unknown>;
        const list =
          record.referenceDocuments ??
          record.ReferenceDocuments ??
          record.files ??
          record.documents;
        return Array.isArray(list) ? list : [];
      },
    }),

    securitiesCreditingVerify: builder.mutation<
      SecuritiesCreditingStatusDetails,
      { requestGuid: string }
    >({
      query: ({ requestGuid }) => ({
        url: API_REQUEST_SECURITIES_CREDITING_VERIFY,
        method: 'POST',
        body: { requestGuid },
      }),
    }),

    securitiesCreditingCommit: builder.mutation<
      SecuritiesCreditingStatusDetails,
      { requestGuid: string }
    >({
      query: ({ requestGuid }) => ({
        url: API_REQUEST_SECURITIES_CREDITING_COMMIT,
        method: 'POST',
        body: { requestGuid },
      }),
    }),
*/

// exports:
// useGetSecuritiesCreditingParamsQuery,
// useSecuritiesCreditingMutation,
// useLazyGetSecuritiesCreditingQuery,
// useLazyGetSecuritiesCreditingFilesQuery,
// useSecuritiesCreditingVerifyMutation,
// useSecuritiesCreditingCommitMutation,
