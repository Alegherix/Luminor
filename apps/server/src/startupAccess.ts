export const isWildcardHost = (host: string | undefined): boolean =>
  host === "0.0.0.0" || host === "::" || host === "[::]";

export const unwrapIpAddress = (value: string): string => {
  const unbracketed = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return unbracketed.toLowerCase().replace(/^::ffff:/, "");
};

export const isLoopbackHost = (host: string | undefined): boolean => {
  if (!host) return true;
  const normalized = unwrapIpAddress(host);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
};

export const isLoopbackAddress = (localAddress: string | undefined): boolean => {
  if (!localAddress) return false;
  const normalized = unwrapIpAddress(localAddress);
  return normalized === "127.0.0.1" || normalized === "::1";
};

export function requestLocalAddress(request: { readonly source: object }): string | undefined {
  const source = request.source as { socket?: { localAddress?: unknown } };
  return typeof source.socket?.localAddress === "string" ? source.socket.localAddress : undefined;
}

export const formatHostForUrl = (host: string): string =>
  host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;

export const resolveListeningPort = (address: unknown, fallbackPort: number): number => {
  if (
    typeof address === "object" &&
    address !== null &&
    "port" in address &&
    typeof address.port === "number"
  ) {
    return address.port;
  }
  return fallbackPort;
};
