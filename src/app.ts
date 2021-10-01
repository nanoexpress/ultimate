/* eslint-disable max-lines */
import uWS, {
  HttpRequest,
  RecognizedString,
  TemplatedApp,
  us_listen_socket,
  WebSocketBehavior
} from 'uWebSockets.js';
import FindRoute from './find-route';
import _gc from './helpers/gc';
import { HttpResponse } from './polyfills';
import Route from './route';
import { HttpHandler, HttpMethod } from './types/find-route';
import { INanoexpressOptions, IWebsocketRoute } from './types/nanoexpress';

class App {
  get config(): INanoexpressOptions {
    return this._config;
  }

  get https(): boolean {
    return this._config.https !== undefined && this._config.isSSL !== false;
  }

  get _console(): Console {
    return this._config.console || console;
  }

  get raw(): TemplatedApp {
    return this._app;
  }

  protected _config: INanoexpressOptions;

  protected _app: TemplatedApp;

  _router: FindRoute;

  protected _ws: IWebsocketRoute[];

  protected _pools: HttpResponse[];

  protected _poolsSize: number;

  protected time: [number, number];

  protected _separateServed: boolean;

  protected _ran: boolean;

  protected _instance: Record<string, us_listen_socket | null>;

  constructor(config: INanoexpressOptions, app: TemplatedApp) {
    this._config = config;
    this._app = app;
    this._router = new FindRoute(config);

    this._ws = [];
    this._pools = [];
    this._poolsSize = config?.poolSize || 10;

    this.time = process.hrtime();
    this._separateServed = false;
    this._ran = false;

    this._instance = {};

    return this;
  }

  setNotFoundHandler(handler: HttpHandler<HttpMethod>): this {
    this._router.setNotFoundHandler(handler);

    return this;
  }

  use(
    basePath: string | HttpHandler<HttpMethod>,
    ...middlewares: Array<HttpHandler<HttpMethod> | Route>
  ): this {
    if (typeof basePath === 'function') {
      middlewares.unshift(basePath);
      basePath = '*';
    }
    middlewares.forEach((handler: Route | HttpHandler<HttpMethod>) => {
      if (handler instanceof Route) {
        const { _routers, _ws } = handler;
        _routers.forEach(({ method, path, handler: routeHandler }) => {
          this._router.on(method, path as string, routeHandler);
        });
        this._ws.push(..._ws);
        handler._app = this;
        handler._basePath = basePath as string;
        _routers.length = 0;
        _ws.length = 0;
      } else {
        this._router.on('ANY', basePath as string, handler);
      }
    });

    return this;
  }

  on(
    method: HttpMethod,
    path: string | RegExp,
    ...handlers: HttpHandler<HttpMethod>[]
  ): this {
    handlers.forEach((handler) => {
      this._router.on(method.toUpperCase() as HttpMethod, path, handler);
    });
    _gc();
    return this;
  }

  get(path: string | RegExp, ...handlers: HttpHandler<'GET'>[]): this {
    return this.on('GET', path, ...(handlers as HttpHandler<HttpMethod>[]));
  }

  post(path: string | RegExp, ...handlers: HttpHandler<'POST'>[]): this {
    return this.on('POST', path, ...(handlers as HttpHandler<HttpMethod>[]));
  }

  put(path: string | RegExp, ...handlers: HttpHandler<'PUT'>[]): this {
    return this.on('PUT', path, ...(handlers as HttpHandler<HttpMethod>[]));
  }

  options(path: string | RegExp, ...handlers: HttpHandler<'OPTIONS'>[]): this {
    return this.on('OPTIONS', path, ...(handlers as HttpHandler<HttpMethod>[]));
  }

  del(path: string | RegExp, ...handlers: HttpHandler<'DEL'>[]): this {
    return this.on('DEL', path, ...(handlers as HttpHandler<HttpMethod>[]));
  }

  ws(path: RecognizedString, options: WebSocketBehavior): this {
    this._app.ws(path, options);

    return this;
  }

  publish(
    topic: RecognizedString,
    message: RecognizedString,
    isBinary?: boolean,
    compress?: boolean
  ): boolean {
    return this._app.publish(topic, message, isBinary, compress);
  }

  // eslint-disable-next-line max-lines-per-function, complexity
  runModern(): this {
    const {
      _app: app,
      _config: config,
      _ws,
      _pools,
      _poolsSize,
      _router: router,
      _ran
    } = this;

    if (!_ran) {
      // eslint-disable-next-line max-lines-per-function, complexity
      for (const route of router.search()) {
        if (route.regex && !route.originalPath) {
          continue; // TO-DO: handle later
        }
        switch (route.method) {
          case 'GET': {
            // eslint-disable-next-line @typescript-eslint/no-loop-func
            const keys =
              route.fetch_params && route.params_id
                ? route.params_id.map((param) => param.name)
                : [];
            // eslint-disable-next-line max-lines-per-function
            app.get(route.originalPath as string, async (rawRes, rawReq) => {
              let res: HttpResponse | undefined;
              const req = rawReq as HttpRequest & {
                url: string;
                path: string;
                method: 'GET';
                stream: boolean;
                params?: Record<string, string>;
              };
              req.url = route.fetch_params
                ? req.getUrl()
                : (route.path as string);

              if (route.fetch_params) {
                req.params = {};
              }

              req.path = req.url;
              req.method = 'GET';

              if (_pools.length > 0) {
                res = _pools.shift() as HttpResponse;
                res.setResponse(rawRes, req);
              } else {
                res = new HttpResponse(config);
                res.setResponse(rawRes, req);
              }

              if (route.fetch_params) {
                const params: Record<string, string> = {};
                for (let i = 0, len = keys.length; i < len; i += 1) {
                  params[keys[i]] = req.getParameter(i);
                }
              }

              if (router.async && router.await) {
                res.exposeAborted();
                await router.lookup(req, res);
                if (_pools.length < _poolsSize) {
                  _pools.push(res);
                }
                return;
              }

              router.lookup(req, res);
              if (_pools.length < _poolsSize) {
                _pools.push(res);
              }
            });
            break;
          }
          default: {
            break;
          }
        }
      }
      app.any('/*', async (rawRes, rawReq): Promise<void> => {
        let res: HttpResponse | undefined;
        const req = rawReq as HttpRequest & {
          url: string;
          path: string;
          method: HttpMethod;
          stream: boolean;
        };

        if (_pools.length > 0) {
          res = _pools.shift() as HttpResponse;
          res.setResponse(rawRes, rawReq);
        } else {
          res = new HttpResponse(config);
          res.setResponse(rawRes, rawReq);
        }

        req.url = req.getUrl();

        req.path = req.url;
        req.method = req.getMethod().toUpperCase() as HttpMethod;

        if (res.aborted || res.done || req.method === 'OPTIONS') {
          return;
        }

        if (router.async && router.await) {
          if (!req.stream) {
            res.exposeAborted();
          }
          await router.lookup(req, res);
          if (_pools.length < _poolsSize) {
            _pools.push(res);
          }
          return;
        }

        router.lookup(req, res);
        if (_pools.length < _poolsSize) {
          _pools.push(res);
        }
      });

      _ws.forEach(({ path, options }) => {
        this._app.ws(path, options);
      });
      // Cleanup GC
      _ws.length = 0;
      _gc();

      this._ran = true;
    }

    return this;
  }

  // eslint-disable-next-line max-lines-per-function, complexity
  run(): this {
    const {
      _app: app,
      _config: config,
      _ws,
      _pools,
      _poolsSize,
      _router: router,
      _ran
    } = this;

    if (!_ran) {
      // eslint-disable-next-line max-lines-per-function, complexity
      app.any('/*', async (rawRes, rawReq): Promise<void> => {
        let res: HttpResponse | undefined;
        const req = rawReq as HttpRequest & {
          url: string;
          path: string;
          method: HttpMethod;
          params?: Record<string, string>;
          stream: boolean;
        };

        if (_pools.length > 0) {
          res = _pools.shift() as HttpResponse;
          res.setResponse(rawRes, rawReq);
        } else {
          res = new HttpResponse(config);
          res.setResponse(rawRes, rawReq);
        }

        req.url = req.getUrl();

        req.path = req.url;
        req.method = req.getMethod().toUpperCase() as HttpMethod;

        if (router.fetchParams) {
          req.params = {};
        }

        if (res.aborted || res.done || req.method === 'OPTIONS') {
          return;
        }

        if (router.async && router.await) {
          if (!req.stream) {
            res.exposeAborted();
          }
          await router.lookup(req, res);
          if (_pools.length < _poolsSize) {
            _pools.push(res);
          }
          return;
        }

        router.lookup(req, res);
        if (_pools.length < _poolsSize) {
          _pools.push(res);
        }
      });

      _ws.forEach(({ path, options }) => {
        this._app.ws(path, options);
      });
      // Cleanup GC
      _ws.length = 0;
      _gc();

      this._ran = true;
    }

    return this;
  }

  listenSocket(
    port: number,
    host = 'localhost',
    is_ssl?: boolean
  ): Promise<us_listen_socket> {
    const { _config: config } = this;

    if (this.https && config.https?.separateServer && !this._separateServed) {
      const httpsPort =
        typeof config.https.separateServer === 'number'
          ? config.https.separateServer
          : 443;
      this._separateServed = true;
      return Promise.all([
        this.listen(port || 80, host, false),
        this.listen(httpsPort, host, true)
      ]);
    }

    return this._appApplyListen(host, port, is_ssl);
  }

  listen(
    port:
      | number
      | number[]
      | Array<{ host: string; port: number; is_ssl?: boolean }>,
    host: string | string[] = 'localhost',
    is_ssl?: boolean
  ): Promise<us_listen_socket> {
    if (Array.isArray(port)) {
      return Promise.all(
        port.map(
          (
            listenObject:
              | { host: string; port: number; is_ssl?: boolean }
              | number,
            index: number
          ): Promise<us_listen_socket> => {
            if (typeof listenObject === 'object') {
              return this.listen(
                listenObject.port,
                listenObject.host,
                listenObject.is_ssl
              );
            }

            return this.listen(port, Array.isArray(host) ? host[index] : host);
          }
        )
      );
    }
    this.run();
    return this.listenSocket(port, host as string, is_ssl);
  }

  close(port: number, host = 'localhost'): boolean {
    const id = `${host}:${port}`;
    const token = this._instance[id];

    this._separateServed = false;
    this.time[0] = 0;
    this.time[1] = 0;

    return this._close(token, id);
  }

  // eslint-disable-next-line max-lines-per-function
  protected _appApplyListen(
    host: string,
    port: number,
    is_ssl?: boolean
  ): Promise<us_listen_socket> {
    const { _console, _config: config, _app: app } = this;

    // eslint-disable-next-line no-nested-ternary
    const sslString = is_ssl ? 'HTTPS ' : is_ssl === false ? 'HTTP ' : '';

    return new Promise((resolve, reject): void => {
      if (port === undefined) {
        const _errorContext = 'error' in _console ? _console : console;

        _errorContext.error('[Server]: PORT is required');
        return undefined;
      }
      const id = `${host}:${port}`;

      const onListenHandler = (token: us_listen_socket): void => {
        if (token) {
          const _debugContext = 'debug' in _console ? _console : console;
          const end = process.hrtime(this.time);

          this._instance[id] = token;
          _debugContext.debug(
            `[${sslString}Server]: started successfully at [${id}] in [${(
              (Number(end[0]) * 1000 + Number(end[1])) /
              1000000
            ).toFixed(2)}ms]`
          );
          _gc();
          return resolve(token);
        }
        const _errorContext = 'error' in _console ? _console : console;

        const err = new Error(
          this.https &&
          (!config.https ||
            !config.https.cert_file_name ||
            !config.https.key_file_name)
            ? `[${sslString}Server]: SSL certificate was not defined or loaded`
            : `[${sslString}Server]: failed to host at [${id}]`
        );
        _errorContext.error(err.message);
        _gc();
        return reject(err);
      };

      if (host) {
        app.listen(host, port, onListenHandler);
      } else {
        app.listen(port, onListenHandler);
      }
    });
  }

  _close(token: us_listen_socket | null, id: string): boolean {
    const { _console } = this;

    if (token) {
      const _debugContext = 'debug' in _console ? _console : console;

      uWS.us_listen_socket_close(token);
      this._instance[id] = null;
      _debugContext.debug('[Server]: stopped successfully');
      _gc();

      return true;
    }

    const _errorContext = 'error' in _console ? _console : console;

    _errorContext.error('[Server]: Error, failed while stopping');
    _gc();

    return false;
  }
}

export default App;
