export const isMissingRpcError = (error: unknown) => {
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return (
    message.includes("could not find") ||
    message.includes("function") ||
    message.includes("pgrst202")
  );
};

export const getRpcUnavailableError = (rpcName: string) =>
  new Error(
    `RPC do quiosque indisponível (${rpcName}). Ambiente desatualizado: aplique as migrations do quiosque antes de usar esta tela.`
  );

export const assertOfficialKioskRpc = (params: {
  rpcName: string;
  error: unknown;
  allowFallback: boolean;
  normalizeError: (error: unknown) => Error;
}) => {
  if (!isMissingRpcError(params.error)) {
    throw params.normalizeError(params.error);
  }
  if (!params.allowFallback) {
    throw getRpcUnavailableError(params.rpcName);
  }
};
