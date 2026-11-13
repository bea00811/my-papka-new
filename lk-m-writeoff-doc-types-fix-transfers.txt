$ErrorActionPreference = "Stop"
$path = "src/core/api/transfers.ts"
$c = [IO.File]::ReadAllText($path)

if ($c -notmatch "SecuritiesDepoDocType") {
  $c = $c.Replace(
    "  SecuritiesContractorsResponse,`r`n  SecuritiesWriteOffCommitParams,",
    "  SecuritiesContractorsResponse,`r`n  SecuritiesDepoDocType,`r`n  SecuritiesDocTypesRequestParams,`r`n  SecuritiesDocTypesResponse,`r`n  SecuritiesWriteOffCommitParams,")
  if ($c -notmatch "SecuritiesDepoDocType") {
    $c = $c.Replace(
      "  SecuritiesContractorsResponse,`n  SecuritiesWriteOffCommitParams,",
      "  SecuritiesContractorsResponse,`n  SecuritiesDepoDocType,`n  SecuritiesDocTypesRequestParams,`n  SecuritiesDocTypesResponse,`n  SecuritiesWriteOffCommitParams,")
  }
}

if ($c -notmatch "API_REQUEST_SECURITIES_DOC_TYPES") {
  $c = $c.Replace(
    "  API_REQUEST_SECURITIES_CONTRACTORS,`r`n  API_REQUEST_SECURITIES_WRITEOFF,",
    "  API_REQUEST_SECURITIES_CONTRACTORS,`r`n  API_REQUEST_SECURITIES_DOC_TYPES,`r`n  API_REQUEST_SECURITIES_WRITEOFF,")
  if ($c -notmatch "API_REQUEST_SECURITIES_DOC_TYPES") {
    $c = $c.Replace(
      "  API_REQUEST_SECURITIES_CONTRACTORS,`n  API_REQUEST_SECURITIES_WRITEOFF,",
      "  API_REQUEST_SECURITIES_CONTRACTORS,`n  API_REQUEST_SECURITIES_DOC_TYPES,`n  API_REQUEST_SECURITIES_WRITEOFF,")
  }
}

$ep = @"
    getSecuritiesDocTypes: builder.query<
      SecuritiesDepoDocType[],
      SecuritiesDocTypesRequestParams | void
    >({
      keepUnusedDataFor: 0,
      query: (params) => ({
        url: API_REQUEST_SECURITIES_DOC_TYPES,
        params:
          params?.changeOwnership === undefined
            ? undefined
            : { changeOwnership: params.changeOwnership },
      }),
      transformResponse: (
        data: SecuritiesDocTypesResponse | SecuritiesDepoDocType[] | Record<string, unknown>,
      ) => {
        if (Array.isArray(data)) {
          return data;
        }

        const record = data as Record<string, unknown>;
        const list =
          (record.depoDocTypes as SecuritiesDepoDocType[] | undefined) ??
          (record.depoDocType as SecuritiesDepoDocType[] | undefined) ??
          (record.docTypes as SecuritiesDepoDocType[] | undefined);

        return Array.isArray(list) ? list : [];
      },
    }),

"@

if ($c -notmatch "getSecuritiesDocTypes") {
  $marker = "    getSecuritiesContractors: builder.query<"
  if ($c -notmatch [regex]::Escape($marker)) { throw "marker getSecuritiesContractors not found" }
  $nl = if ($c.Contains("`r`n")) { "`r`n" } else { "`n" }
  $epUse = $ep -replace "`n", $nl
  $c = $c.Replace($marker, $epUse + $marker)
}

if ($c -notmatch "useGetSecuritiesDocTypesQuery") {
  $c = $c.Replace(
    "  useGetSecuritiesWriteOffParamsQuery,`r`n  useGetSecuritiesContractorsQuery,",
    "  useGetSecuritiesWriteOffParamsQuery,`r`n  useGetSecuritiesDocTypesQuery,`r`n  useGetSecuritiesContractorsQuery,")
  if ($c -notmatch "useGetSecuritiesDocTypesQuery") {
    $c = $c.Replace(
      "  useGetSecuritiesWriteOffParamsQuery,`n  useGetSecuritiesContractorsQuery,",
      "  useGetSecuritiesWriteOffParamsQuery,`n  useGetSecuritiesDocTypesQuery,`n  useGetSecuritiesContractorsQuery,")
  }
}

if ($c -notmatch "getSecuritiesDocTypes") { throw "getSecuritiesDocTypes was not inserted" }
if ($c -notmatch "useGetSecuritiesDocTypesQuery") { throw "useGetSecuritiesDocTypesQuery was not inserted" }

[IO.File]::WriteAllText($path, $c)
Write-Host "OK: transfers.ts updated"
