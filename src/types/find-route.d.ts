import { Key } from 'path-to-regexp';
import { HttpRequest } from 'uWebSockets.js';
import { HttpResponse } from '../polyfills';

export interface HttpRequestExtended<T> extends HttpRequest {
  method: T;
  path: string;
  params?: Record<string, string>;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'OPTIONS' | 'DEL' | 'ANY';
export type HttpHandler<T> = (
  req: HttpRequestExtended<T>,
  res: HttpResponse
) => HttpResponse | void | Promise<HttpResponse> | Promise<void>;

export interface UnpreparedRoute {
  method: HttpMethod;
  path: string | RegExp;
  handler: HttpHandler<HttpMethod>;
}

export interface PreparedRoute extends Omit<UnpreparedRoute, 'path'> {
  async: boolean;
  await: boolean;
  all: boolean;
  fetch_params: boolean;
  params_id?: Key[];
  path: RegExp | string;
  originalPath: string | null;
  regex: boolean;
  legacy: boolean;
}
