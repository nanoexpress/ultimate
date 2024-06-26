import uWS from 'uWebSockets.js';
import { INanoexpressOptions } from '../types/nanoexpress';
import App from './app';
import { exposeWebsocket } from './exposes';
import { useCallback, useEffect, useMemo, useRef, useState } from './hooks';
import Router from './router';

/**
 * Instance initializer for nanoexpress
 * @param options Instance options
 * @param options.enableExpressCompatibility Sets polyfill status
 * @param options.ignoreTrailingSlash Normalizes trailing slash on routes
 * @returns
 */
const nanoexpress = (
  options: INanoexpressOptions = {
    ignoreTrailingSlash: true,
    enableExpressCompatibility: false,
    responseMode: 'cork'
  }
): App => {
  let app;

  if (options.https) {
    app = uWS.SSLApp(options.https);
  } else if (options.http) {
    app = uWS.App(options.http);
  } else {
    app = uWS.App();
  }

  return new App(options, app);
};

nanoexpress.Router = Router;
nanoexpress.App = App;

// Add exposes
nanoexpress.exposeWebsocket = exposeWebsocket;

export {
  nanoexpress as default,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
};
