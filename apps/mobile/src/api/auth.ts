import {
  AuthBearerBootstrapResult,
  AuthWebSocketTokenResult,
  type AuthBootstrapInput,
} from "@luminor/contracts";
import { Schema } from "effect";

import { errorMessageFromBody, HttpRequestError, requestJson } from "./http";
import { makeBearerBootstrapUrl, makeWsTokenUrl } from "./urls";

const AuthBearerBootstrapHttpResult = Schema.Struct({
  ...AuthBearerBootstrapResult.fields,
  expiresAt: Schema.DateTimeUtcFromString,
});

const AuthWebSocketTokenHttpResult = Schema.Struct({
  ...AuthWebSocketTokenResult.fields,
  expiresAt: Schema.DateTimeUtcFromString,
});

export async function exchangePairingCredential(
  baseUrl: string,
  credential: string,
  signal?: AbortSignal,
): Promise<AuthBearerBootstrapResult> {
  const input: AuthBootstrapInput = { credential: credential.trim() };
  const response = await requestJson({
    url: makeBearerBootstrapUrl(baseUrl),
    method: "POST",
    body: input,
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new HttpRequestError(
      errorMessageFromBody(response.body, `Pairing failed with status ${response.status}`),
      response.status,
      response.body,
    );
  }
  return Schema.decodeUnknownPromise(AuthBearerBootstrapHttpResult)(response.body);
}

export async function issueWsToken(
  baseUrl: string,
  bearerToken: string,
  signal?: AbortSignal,
): Promise<AuthWebSocketTokenResult> {
  const response = await requestJson({
    url: makeWsTokenUrl(baseUrl),
    method: "POST",
    bearerToken,
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new HttpRequestError(
      errorMessageFromBody(
        response.body,
        `WebSocket ticket request failed with status ${response.status}`,
      ),
      response.status,
      response.body,
    );
  }
  return Schema.decodeUnknownPromise(AuthWebSocketTokenHttpResult)(response.body);
}
