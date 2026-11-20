export const DEFAULT_CREDITING_ERROR_MESSAGE =
  'Не удалось отправить поручение. Попробуйте ещё раз или повторите позже.';

export const getCreditingErrorMessage = (error: unknown): string => {
  const record = error as {
    data?: { message?: string; Message?: string; errorMessage?: string };
    error?: string;
    message?: string;
  };

  return (
    record?.data?.message ||
    record?.data?.Message ||
    record?.data?.errorMessage ||
    record?.message ||
    (typeof record?.error === 'string' ? record.error : undefined) ||
    DEFAULT_CREDITING_ERROR_MESSAGE
  );
};
