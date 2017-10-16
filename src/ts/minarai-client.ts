const EventEmitter2 = require('eventemitter2');
const axios = require('axios');
const querystring = require('querystring');
import logger from './logger';

export interface MinaraiClientConstructorOptions {
  io: any;
  lang: string;
  socketIORootURL: string;
  socketIOOptions: any;
  imageUrl: string;
  applicationId: string;
  clientId?: string;
  userId?: string;
  deviceId?: string;
  debug?: boolean;
  silent?: boolean;
}

export interface SendOptions {
  lang?: string;
  position?: string;
  extra?: string;
}

export interface IGetLogsOptions {
  ltDate?: string;
  limit?: number;
}

export default class MinaraiClient extends EventEmitter2.EventEmitter2 {
  private socket: any;
  private applicationId: string;
  private clientId: string|number;
  private userId: string|number;
  private deviceId: string|number;
  private lang: string|number;

  constructor(opts: MinaraiClientConstructorOptions) {
    super();

    if (!opts.io || !opts.socketIORootURL || !opts.applicationId) {
      throw new InvalidArgumentError("opts must contain io, socketIORootURL, and applicationId");
    }

    this.socket = opts.io.connect(opts.socketIORootURL, opts.socketIOOptions);
    this.applicationId = opts.applicationId;
    this.clientId = opts.clientId;
    this.userId = opts.userId;
    this.deviceId = opts.deviceId || `devise_id_${this.applicationId}_${new Date().getTime()}`;
    this.lang = opts.lang || 'ja';

    if (opts.imageUrl) {
      this.imageUrl = `${opts.imageUrl.replace(/\/$/, '')}/upload-image`;
    }

    logger.set({debug: opts.debug, silent: opts.silent});
  }

  init() {
    this.socket.on('connect', () => {
      logger.debug('connect');
      this.emit('connect');

      this.socket.emit('join-as-client', {
        applicationId: this.applicationId,
        clientId: this.clientId,
        userId: this.userId,
        deviceId: this.deviceId,
      });
    });

    this.socket.on('disconnect', () => {
      logger.debug('disconnect');
      this.emit('disconnected');
    });

    this.socket.on('joined', (data: any) => {
      this.applicationId = data.applicationId;
      this.clientId = data.clientId;
      this.userId = data.userId;
      this.deviceId = data.deviceId;

      logger.obj('joined', data);
      this.emit('joined', data);
    });

    this.socket.on('sync', (data:any) => {
      logger.obj('sync', data);
      this.emit('sync', data);
    });

    this.socket.on('sync-system-command', (data:any) => {
      logger.obj('sync-system-command', data);
      this.emit('sync-system-command', data);
    });

    this.socket.on('sync-command', (data:any) => {
      logger.obj('sync-command', data);
      this.emit('sync-command', data);
    });

    this.socket.on('message', (data:any) => {
      logger.obj('message', data);
      this.emit('message', data);
    });

    this.socket.on('operator-command', (data:any) => {
      logger.obj('operator-command', data);
      this.emit('operator-command', data);
    });

    this.socket.on('system-message', (data:any) => {
      logger.obj('system-message', data);
      this.emit('system-message', data);
    });

    this.socket.on('logs', (data: any) => {
      logger.obj('logs', data);
      this.emit('logs', data);
    });
  }

  public send(uttr, options?: SendOptions) {
    options = Object.assign({}, { lang: 'ja-JP' }, options || {});
    const timestamp = new Date().getTime();
    const payload = {
      id: `${this.applicationId}${this.clientId}${this.userId}${this.deviceId}-${timestamp}`,
      head: {
        applicationId: this.applicationId,
        clientId: this.clientId,
        userId: this.userId,
        deviceId: this.deviceId,
        lang: options.lang || 'ja-JP',
        timestampUnixTime: timestamp,
      },
      body: {
        message: uttr,
        position: options.position || {},
        extra: options.extra || {},
      },
    };
    logger.obj('send', payload);
    this.socket.emit('message', payload);
  }

  public sendSystemCommand(command, payload) {
    logger.warn('This method (sendSystemCommand) is deprecated. Please use "sendCommand" instead.');
    const message = { command: command, payload: payload };
    const timestamp = new Date().getTime();
    const payload = {
      id: `${this.applicationId}${this.clientId}${this.userId}${this.deviceId}-${timestamp}-system`,
      head: {
        applicationId: this.applicationId,
        clientId: this.clientId,
        userId: this.userId,
        deviceId: this.deviceId,
      },
      body: { message: message },
    };
    logger.obj('send-system-command', payload);
    this.socket.emit('system-command', payload);
  }

  public sendCommand(name, extra) {
    const timestamp = new Date().getTime();
    const payload = {
      id: `${this.applicationId}${this.clientId}${this.userId}${this.deviceId}-${timestamp}-command`,
      head: {
        applicationId: this.applicationId,
        clientId: this.clientId,
        userId: this.userId,
        deviceId: this.deviceId,
      },
      body: { name, extra },
    };
    logger.obj('send-command', payload);
    this.socket.emit('command', payload);
  }

  public getLogs(options: IGetLogsOptions = {}) {
    const timestamp = new Date().getTime();
    const payload = {
      id: `${this.applicationId}${this.clientId}${this.userId}${this.deviceId}-${timestamp}-logs`,
      head: {
        applicationId: this.applicationId,
        clientId: this.clientId,
        userId: this.userId,
        deviceId: this.deviceId,
        timestampUnixTime: timestamp,
      },
      body: options,
    };
    logger.obj('logs', payload);
    this.socket.emit('logs', payload);
  }

  public forceDisconnect() {
    logger.obj('force-disconnect');
    this.socket.emit('force-disconnect');
  }

  public uploadImage(file: File, opts?: SendOptions) {
    if (!this.imageUrl) {
      throw new TypeError("`imageUrl` is needed to upload image.");
    }

    const form = new FormData();
    form.append("applicationId", this.applicationId);
    form.append("clientId", this.clientId);
    form.append("userId", this.userId);
    form.append("deviceId", this.deviceId);
    form.append( 'file', file, file.name );

    if (opts && opts.extra) {
      form.append("params", JSON.stringify(opts.extra));
    }

    return axios.post(this.imageUrl, form)
      .then((res) => {
        let {url} = res.data;

        if (!url) {
          return { "error": "url dose not exist" };
        }

        const query = querystring.stringify({
          applicationId: this.applicationId,
          userId: this.userId
        });
        url += `?${query}`;

        return { ok: true, [res.data.message === "ok" ? "result" : "error"]: { url } };
      })
      .catch((err) => {
        return { err };
      })
  }
}

export class InvalidArgumentError extends Error {
}
