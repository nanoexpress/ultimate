// eslint-disable-next-line @eslint-community/eslint-comments/disable-enable-pair
/* eslint-disable max-lines, max-lines-per-function, max-depth */
import { EventEmitter } from 'events';
import { createReadStream, ReadStream, statSync } from 'fs';
import uWS, { RecognizedString } from 'uWebSockets.js';
import {
  BrotliCompress,
  BrotliOptions,
  createBrotliCompress,
  createDeflate,
  createGzip,
  Deflate,
  Gzip,
  ZlibOptions
} from 'zlib';
import { INanoexpressOptions } from '../../types/nanoexpress';
import {
  request as resRequest,
  resAbortHandler,
  resAbortHandlerExpose,
  resConfig,
  resEvents,
  resHeaders,
  response as resResponse
} from '../constants';
import { debug, getMime, httpCodes, invalid, warn } from '../helpers';
import HttpRequest from './http-request';

/**
 * HttpResponse class
 * @constructor
 * @class
 * @namespace nanoexpress.HttpResponse
 * @memberof nanoexpress
 * @example new HttpResponse().setResponse(uWS.HttpResponse)
 */
class HttpResponse {
  public [resRequest]: HttpRequest | null;

  public [resResponse]: uWS.HttpResponse | null;

  // Expose functionality properties
  protected [resHeaders]: Record<string, RecognizedString | null> | null;

  protected [resAbortHandler]: (() => void)[];

  protected [resAbortHandlerExpose]: boolean;

  protected [resConfig]: INanoexpressOptions;

  protected [resEvents]: EventEmitter | null;

  public done: boolean;

  public aborted: boolean;

  public streaming: boolean;

  protected _headersSet = false;

  protected registered: boolean;

  protected mode: 'immediate' | 'queue' | 'cork' = 'queue';

  public serialize?: (
    data: Record<string, unknown> | string | number | boolean
  ) => string;

  public compiledResponse?: string;

  public statusCode: number;

  id = 0;

  constructor(config: INanoexpressOptions) {
    this[resConfig] = config;
    this.done = false;
    this.aborted = false;
    this._headersSet = false;
    this.registered = false;
    this.streaming = false;
    this[resEvents] = null;
    this[resAbortHandler] = [];
    this[resAbortHandlerExpose] = false;

    this[resRequest] = null;
    this[resResponse] = null;
    this[resHeaders] = null;

    this.mode = config.responseMode;

    this.statusCode = 200;
  }

  protected registerEvents(): this {
    const emitter = this[resEvents];

    if (emitter && !this.registered) {
      this.exposeAborted();

      emitter
        .on('pipe', (stream) => {
          debug('stream.pipe(res)');

          this.streaming = true;
          this.stream(stream);
        })
        .on('data', () => {
          debug('stream.pipe(res):data event');
        })

        .on('unpipe', () => {
          debug('stream.unpipe(res)');

          this.aborted = true;
        })
        .on('error', () => {
          debug('stream.pipe(res) error');
          this.aborted = true;
          this.end();
        });
      this.registered = true;
    }

    return this;
  }

  /**
   * Registers event to response
   * @param eventName Event name
   * @param eventArgument Any argument
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.on('end', (eventArgument) => {...})
   */
  on(
    eventName: string | symbol,
    eventArgument: (eventArg?: unknown) => void
  ): this {
    let emitter = this[resEvents];

    if (!emitter) {
      this[resEvents] = new EventEmitter();
    }
    emitter = this[resEvents] as EventEmitter;
    emitter.on(eventName, eventArgument);

    debug('res.on(%s, handler)', eventName);

    this.registerEvents();

    return this;
  }

  /**
   * Registers event to response to be fired once
   * @param eventName Event name
   * @param eventArgument Any argument
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.once('end', (eventArgument) => {...})
   */
  once(
    eventName: string | symbol,
    eventArgument: (eventArg?: unknown) => void
  ): this {
    let emitter = this[resEvents];

    if (!emitter) {
      this[resEvents] = new EventEmitter();
    }
    emitter = this[resEvents] as EventEmitter;
    emitter.once(eventName, eventArgument);

    debug('res.once(%s, handler)', eventName);

    this.registerEvents();

    return this;
  }

  /**
   * Removes event from response
   * @param eventName Event name
   * @param eventArgument Any argument
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.off('end', (eventArgument) => {...})
   */
  off(
    eventName: string | symbol,
    eventArgument: (eventArg?: unknown) => void
  ): this {
    let emitter = this[resEvents];

    if (!emitter) {
      return this;
    }
    emitter = this[resEvents] as EventEmitter;
    emitter.off(eventName, eventArgument);

    debug('res.off(%s, handler)', eventName);

    this.registerEvents();

    return this;
  }

  /**
   * Removes listener from response
   * @param eventName Event name
   * @param eventArgument Any argument
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.removeListener('end', (eventArgument) => {...})
   */
  removeListener(
    eventName: string | symbol,
    eventArgument: (eventArg?: unknown) => void
  ): this {
    let emitter = this[resEvents];

    if (!emitter) {
      return this;
    }
    emitter = this[resEvents] as EventEmitter;
    emitter.removeListener(eventName, eventArgument);

    debug('res.removeListener(%s, handler)', eventName);

    this.registerEvents();

    return this;
  }

  /**
   * Emits event to response
   * @param eventName Event name
   * @param eventArgument Any argument
   * @returns Emit response
   * @memberof nanoexpress.HttpResponse
   * @example res.emit('end', 1)
   */
  emit(eventName: string | symbol, eventArgument?: never): boolean {
    let emitter = this[resEvents];

    if (!emitter) {
      this[resEvents] = new EventEmitter();
    }
    debug('res.emit(%s, argument)', eventName);

    emitter = this[resEvents] as EventEmitter;
    return emitter.emit(eventName, eventArgument);
  }

  /**
   * Set new HttpResponse for current pool
   * @param res Native uWS.HttpResponse instance
   * @param req HttpResponse instance
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.setResponse(res, req)
   */
  setResponse(res: uWS.HttpResponse, req: HttpRequest): this {
    this[resRequest] = req;
    this[resResponse] = res;
    this.done = false;
    this.aborted = res.aborted || false;
    this._headersSet = false;
    this.streaming = false;
    this.registered = false;
    this[resEvents] = null;
    this[resAbortHandlerExpose] = false;
    this[resAbortHandler].length = 0;

    this[resHeaders] = null;
    this.statusCode = 200;

    this.id = Math.round(Math.random() * 1e5);

    return this;
  }

  // Native methods re-implementing
  /**
   * Ends this response by copying the contents of body.
   * @param body Body content
   * @param closeConnection Gives boolean to connection statement
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.end('text');
   */
  end(body?: uWS.RecognizedString, closeConnection?: boolean): this {
    const { mode } = this;
    const res = this[resResponse];

    if (res && mode === 'cork') {
      res.cork(() => {
        this._end(body, closeConnection);
      });
      return this;
    }
    return this._end(body, closeConnection);
  }

  /**
   * Initializes Server-Side Events from your stream
   * @param body Writable stream or PassThrough
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.sse(sseStream);
   */
  sse(body: ReadStream): this {
    const { mode } = this;
    const res = this[resResponse];

    this.exposeAborted();

    if (res && mode === 'cork') {
      res.cork(() => {
        this._sse(body);
      });
      return this;
    }
    return this._sse(body);
  }

  protected _sse(body: ReadStream): this {
    const {
      mode,
      statusCode,
      done,
      streaming,
      _headersSet,
      [resHeaders]: _headers
    } = this;
    const res = this[resResponse];

    if (!done && res && !streaming && !done) {
      debug(
        'res.sse(body) called with status %d and has headers',
        statusCode,
        _headersSet
      );

      res.writeStatus(httpCodes[statusCode]);
      if (mode !== 'immediate') {
        // headers
        if (_headersSet) {
          for (const header in _headers) {
            const value = _headers[header];
            if (value) {
              res.writeHeader(header, value);
            }
          }
        }
      }
      res.writeHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.writeHeader('Connection', 'keep-alive');
      res.writeHeader('Cache-Control', 'no-cache, no-store, no-transform');

      body.on('data', (data) => {
        if (!this.aborted) {
          res.write(data);
        }
      });
      this.streaming = true;
      this[resResponse] = null;
    }
    return this;
  }

  /**
   * @private
   * Ends this response by copying the contents of body.
   * @param body Body content
   * @param closeConnection Gives boolean to connection statement
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res._end('text');
   */
  protected _end(body?: uWS.RecognizedString, closeConnection?: boolean): this {
    const {
      mode,
      statusCode,
      done,
      streaming,
      _headersSet,
      [resHeaders]: _headers
    } = this;
    const res = this[resResponse];

    if (!done && res && !streaming) {
      debug(
        'res.end(body) called with status %d and has headers',
        statusCode,
        _headersSet
      );

      res.writeStatus(httpCodes[statusCode]);
      if (mode !== 'immediate') {
        // headers
        if (_headersSet) {
          for (const header in _headers) {
            const value = _headers[header];
            if (value) {
              res.writeHeader(header, value);
            }
          }
        }
      }
      res.end(body, closeConnection);
      this.done = true;
      this[resResponse] = null;
    }
    return this;
  }

  /**
   * Sets response status
   * @deprecated Please use `res.statusCode` instead
   * @param code Status code
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.status(204);
   */

  status(code: number): this {
    debug('res.status(%d)', code);

    this.statusCode = code;

    return this;
  }

  /**
   * Combine of `res.status` and `res.setHeaders`
   * @param code Status code
   * @param headers Record object containing headers
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.writeHead(200, {'X-Header': 1234});
   */
  writeHead(
    code: number | Record<string, RecognizedString>,
    headers?: Record<string, RecognizedString>
  ): this {
    if (typeof code === 'object' && !headers) {
      headers = code;
      code = 200;
    }

    if (code !== undefined && code !== 200) {
      this.statusCode = code as number;
    }
    if (headers !== undefined) {
      this.setHeaders(headers);
    }

    return this;
  }

  /**
   * Redirect current locate to new
   * @param code Redirect code
   * @param path Path to be redirected
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.redirect('/foo');
   */
  redirect(code: number | string, path?: string): this {
    if (!path && typeof code === 'string') {
      path = code;
      code = 301;
    }
    if (path && path.indexOf('/') === -1) {
      path = `/${path}`;
    }

    this.statusCode = code as number;
    this.setHeader('Location', path as string);

    return this.end();
  }

  /**
   * Sends status with empty body
   * @param code Status code
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.sendStatus(204);
   */
  sendStatus(code: number): this {
    debug('res.sendStatus(%d)', code);

    this.statusCode = code;
    return this.end();
  }

  /**
   * Sends this response by copying the contents of body.
   * @param body Body content
   * @param closeConnection Gives boolean to connection statement
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.send({status: 'success'});
   */
  send(
    data: Record<string, unknown> | string | number | boolean,
    closeConnection?: boolean
  ): this {
    const { done, compiledResponse } = this;
    if (!done && this[resResponse]) {
      if (compiledResponse) {
        return this.end(compiledResponse, closeConnection);
      }
      if (this.serialize) {
        return this.end(this.serialize(data), closeConnection);
      }
      if (typeof data === 'object') {
        this.setHeader('Content-Type', 'application/json; charset=utf-8');
        return this.end(
          JSON.stringify(
            data,
            this[resConfig].json_replacer,
            this[resConfig].json_spaces
          ),
          closeConnection
        );
      }

      return this.end(data as string, closeConnection);
    }
    return this;
  }

  /**
   * @deprecated Use `res.stream` instead of
   * Streams input stream to response output
   * @param stream Input stream
   * @param size Stream size
   * @param compressed Compressed status
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.pipe(readableStream)
   * @alias res.stream(readableStream)
   */
  pipe(stream: ReadStream, size?: number, compressed?: boolean): this {
    debug('res.pipe(stream, %d, %j)', size, compressed);

    return this.stream(stream, size, compressed);
  }

  /**
   * Streams input stream to response output
   * @param stream Input stream
   * @param size Stream size
   * @param compressed Compressed status
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.stream(readableStream)
   */
  stream(stream: ReadStream, size?: number, compressed = false): this {
    const { mode, [resRequest]: req, [resResponse]: res } = this;

    if (req && (!size || Number.isNaN(size)) && req.headers['content-length']) {
      size = +req.headers['content-length'];
    } else if ((!size || Number.isNaN(size)) && stream.path) {
      ({ size } = statSync(stream.path));
    }

    if (res && mode === 'cork') {
      res.cork(() => {
        this._stream(stream, size, compressed);
      });
      return this;
    }

    return this._stream(stream, size, compressed);
  }

  /**
   * @private
   * Streams input stream to response output
   * @param stream Input stream
   * @param size Stream size
   * @param compressed Compressed status
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res._stream(readableStream)
   */
  protected _stream(
    stream: ReadStream,
    size?: number,
    compressed = false
  ): this {
    if (!this.done && this[resResponse] && this[resResponse] !== null) {
      const res = this[resResponse] as uWS.HttpResponse;
      const config = this[resConfig];
      const { mode, statusCode, _headersSet, [resHeaders]: _headers } = this;

      this.exposeAborted();
      let calledData = !config.enableExpressCompatibility;

      if (compressed) {
        const compressedStream = this.compressStream(stream);

        if (compressedStream) {
          stream = compressedStream as unknown as ReadStream;
        }
      }

      const onclose = (): void => {
        if (calledData) {
          this.done = true;
          this.streaming = false;
          this.emit('close');
        } else if (stream.path) {
          stream.close();
          warn(
            'res.stream(stream) data was not called, but mimicked by [nanoexpress], performance may be dropped and even can be stuck at responses, so please use official middlewares to avoid such errors'
          );
          this.stream(createReadStream(stream.path), size, compressed);
        }
      };
      const onfinish = (): void => {
        if (calledData) {
          if (typeof stream.close === 'function') {
            stream.close();
          } else {
            stream.emit('close');
          }
        }
        this.emit('finish');
      };

      res.writeStatus(httpCodes[statusCode]);
      if (mode !== 'immediate') {
        // headers
        if (_headersSet) {
          for (const header in _headers) {
            const value = _headers[header];
            if (value) {
              res.writeHeader(header, value);
            }
          }
        }
      }

      if (compressed || !size || Number.isNaN(size)) {
        debug('res.stream:compressed(stream, %d, %j)', size, compressed);
        stream
          .on('data', (buffer: Buffer): void => {
            calledData = true;

            if (this.aborted || this.done) {
              return;
            }
            res.write(
              buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength
              )
            );
          })
          .on('close', onclose)
          .on('finish', onfinish);
      } else {
        debug('res.stream:uncompressed(stream, %d, %j)', size, compressed);
        stream.on('data', (buffer: Buffer): void => {
          calledData = true;
          if (this.done || this.aborted) {
            return;
          }
          buffer = buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          ) as Buffer;

          const lastOffset = res.getWriteOffset();
          const [ok, done] = res.tryEnd(buffer, size as number);

          if (done) {
            this.done = true;
          } else if (!ok) {
            stream.pause();

            res.onWritable((offset: number): boolean => {
              if (this.done || this.aborted) {
                return true;
              }
              const [writeOk, writeDone] = res.tryEnd(
                buffer.slice(offset - lastOffset),
                size as number
              );
              if (writeDone) {
                this.done = true;
              } else if (writeOk) {
                stream.resume();
              }
              return writeOk;
            });
          }
        });
      }
      stream
        .on('error', (error) => {
          stream.destroy(error);
          this.aborted = true;
          this.emit('error', error as never);
        })
        .on('close', onclose)
        .on('finish', onfinish);
    }
    return this;
  }

  /**
   * Compress stream into compressed into
   * @param stream Readable stream
   * @param options One of compressions (BrotliCompress, ZlibOptions)
   * @param priority Compression picking priority
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.compressStream(writableStream)
   */
  compressStream(
    stream: ReadStream,
    options?: BrotliOptions | ZlibOptions,
    priority = ['gzip', 'br', 'deflate']
  ): BrotliCompress | Gzip | Deflate | null {
    const req = this[resRequest];

    if (!req) {
      invalid(
        'This method requires active `HttpRequest`. Please load required middleware'
      );
      return null;
    }
    if (!req.headers) {
      invalid(
        'This method requires active `HttpRequest.headers`. Please load required middleware'
      );
      return null;
    }
    const contentEncoding = req.headers['content-encoding'];
    const encoding = priority.find(
      (currentEncoding) =>
        contentEncoding && contentEncoding.indexOf(currentEncoding) !== -1
    );

    let compression = null;

    if (encoding === 'br') {
      compression = createBrotliCompress(options);
    } else if (encoding === 'gzip') {
      compression = createGzip(options);
    } else if (encoding === 'deflare') {
      compression = createDeflate(options);
    }

    if (compression && encoding) {
      stream.pipe(compression);
      this.setHeader('content-encoding', encoding);
    }

    return compression;
  }

  /**
   * Sends file to end user with efficient stream
   * @param path File absolute path
   * @param lastModified Sets `Last-Modified` header to prevent infinite re-loading
   * @param compressed Compresses file and saves bandwidth of user
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.sendFile('foo.mp4')
   */
  sendFile(path: string, lastModified = true, compressed = false): this {
    const req = this[resRequest];
    const headers = req?.headers;

    const stat = statSync(path);
    let { size } = stat;

    // handling last modified
    if (lastModified) {
      const { mtime } = stat;

      mtime.setMilliseconds(0);
      const mtimeutc = mtime.toUTCString();

      // Return 304 if last-modified
      if (headers && headers['if-modified-since']) {
        if (new Date(headers['if-modified-since']) >= mtime) {
          this.statusCode = 304;
          return this.end();
        }
      }
      this.setHeader('last-modified', mtimeutc);
    }
    this.setHeader('content-type', getMime(path) as string);

    let start: number | undefined = 0;
    let end: number | undefined = 0;

    if (headers && headers.range) {
      [start, end] = headers.range
        .substr(6)
        .split('-')
        .map((byte: string) => (byte ? parseInt(byte, 10) : undefined));

      // Chrome patch for work
      if (end === undefined) {
        end = size - 1;
      }

      if (start !== undefined) {
        this.statusCode = 206;
        this.setHeader('accept-ranges', 'bytes');
        this.setHeader('content-range', `bytes ${start}-${end}/${size}`);
        size = end - start + 1;
      }
    }

    // for size = 0
    if (end < 0) {
      end = 0;
    }

    const createStreamInstance = end
      ? createReadStream(path, { start, end })
      : createReadStream(path);

    return this.stream(createStreamInstance, size, compressed);
  }

  /**
   * Enters or continues chunked encoding mode. Writes part of the response. End with zero length write.
   * @param chunk Content response chunk
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.write(Buffer.from('Hi'));
   */
  write(chunk: uWS.RecognizedString | ArrayBuffer): this {
    const res = this[resResponse];
    if (!this.done && res && !this.streaming) {
      debug('res.write(%s)', chunk);
      res.write(chunk);
      return this;
    }
    return this;
  }

  /**
   *
   * Exposed methods
   */
  exposeAborted(): this {
    const res = this[resResponse];
    if (!this[resAbortHandlerExpose] && res) {
      debug('res.onAborted is exposed');
      res.onAborted(() => {
        this.aborted = true;
        warn('res.onAborted is called');

        this[resAbortHandler].forEach((callback) => callback());
      });
      this[resAbortHandlerExpose] = true;
    }

    return this;
  }

  onAborted(handler: () => void): this {
    this[resAbortHandler].push(handler);

    return this;
  }

  /**
   * Get response header value by key
   * @param key Header key
   * @returns Returns value of header got by key
   * @example res.getHeader('cookie');
   * @memberof nanoexpress.HttpResponse
   */
  getHeader(key: string): RecognizedString | null {
    const headers = this[resHeaders];
    if (headers && headers[key]) {
      debug("res.getHeader('%s')", key);
      return headers[key];
    }
    return null;
  }

  /**
   * Checks response header value by key
   * @param key Header key
   * @returns Returns `true` if header exists whereas `false` in other cases
   * @example res.hasHeader('cookie');
   * @memberof nanoexpress.HttpResponse
   */
  hasHeader(key: string): boolean {
    debug("res.hasHeader('%s')", key);
    return this.getHeader(key) !== null;
  }

  /**
   * Set response header value by key
   * @param key Header key
   * @param value Header value
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.setHeader('content-type', 'application/json');
   */
  setHeader(key: string, value: uWS.RecognizedString): this {
    const { mode, [resResponse]: res } = this;

    debug("res.setHeader('%s', '%s')", key, value);

    if (res && mode === 'immediate') {
      res.writeHeader(key, value);
      return this;
    }

    if (!this[resHeaders]) {
      this[resHeaders] = {};
    }

    this._headersSet = true;
    const headers = this[resHeaders] as Record<string, typeof value>;
    headers[key] = value;

    return this;
  }

  /**
   * Set response header value by key
   * @param key Header key
   * @param value Header value
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.set('content-type', 'application/json');
   * @alias res.setHeader('content-type', 'application/json');
   */
  set(key: string, value: uWS.RecognizedString): this {
    return this.setHeader(key, value);
  }

  /**
   * Set response headers by Record dict
   * @param headers Header key/value record dict
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.setHeaders({'content-type':'application/json'});
   */
  setHeaders(headers: Record<string, uWS.RecognizedString>): this {
    const { mode, [resResponse]: res } = this;

    if (res && mode === 'immediate') {
      warn('res.setHeaders(headers) cannot be set due of immediate mode');
      return this;
    }

    debug('res.setHeaders(headers)');
    this._headersSet = true;

    if (this[resHeaders]) {
      Object.assign(this[resHeaders], headers);
    } else {
      this[resHeaders] = headers;
    }

    return this;
  }

  /**
   * Remove response header value by key
   * @param key Header key
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.removeHeader('cookie');
   */
  removeHeader(key: string): this {
    const { mode, [resResponse]: res } = this;

    if (res && mode === 'immediate') {
      warn("res.removeHeader('%s') cannot be set due of immediate mode", key);
      return this;
    }

    debug("res.removeHeader('%s')", key);

    const headers = this[resHeaders];
    if (headers && headers[key]) {
      headers[key] = null;
    }

    return this;
  }

  /**
   * Set response content type
   * @param contentType Content type
   * @returns nanoexpress.HttpResponse
   * @memberof nanoexpress.HttpResponse
   * @example res.type('application/json');
   */
  type(contentType: string): this {
    debug('res.type(%s)', contentType);
    return this.setHeader('content-type', contentType);
  }
}

export default HttpResponse;
