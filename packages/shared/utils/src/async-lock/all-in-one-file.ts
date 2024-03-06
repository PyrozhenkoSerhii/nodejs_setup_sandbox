import { EventEmitter } from "stream";

import AsyncLock from "async-lock";

import { Logger, sleep } from "@shared/utils";

interface ILockableCall<T extends Object, C> {
  key: string;
  options: T;
  onFree: (options: T) => Promise<C>;
  onBusy: (options: T) => Promise<C>;
  onError: (options: T) => Promise<C>;
}

class LockService {
  private static lock = new AsyncLock();

  public static async callWithLock<T extends Object, C>(data: ILockableCall<T, C>): Promise<C> {
    const { key, options, onBusy, onError, onFree } = data;

    let result: C;
    if (!LockService.lock.isBusy(key)) {
      result = await LockService.lock.acquire(key, () => onFree(options)).catch((error) => onError({ ...options, error }));
    } else {
      result = await onBusy(options);
    }

    return result;
  }
}

interface IDownloadHandlersOptions {
  operationId: string;
  localUrl: string;
  error?: any;
}

enum EDownloadEvents {
  DOWNLOAD_STATUS="download_status"
}

enum EDownloadStatus {
  PENDING="pending",
  READY="ready",
  ERROR="error",
}

interface IDownloadEventData {
  localUrl: string;
  status: EDownloadStatus;
  error?: any;
}

const url1 = "A";
const url2 = "B";
const url3 = "C";

class DownloadService extends EventEmitter {
  private static logger = new Logger(DownloadService.name);

  private static eventEmitter = new EventEmitter();

  public static async download(options: IDownloadHandlersOptions): Promise<IDownloadEventData> {
    DownloadService.logger.success(`[download] [${options.operationId}] Started ${options.localUrl}`);
    await sleep(1000);

    // test error
    if (options.localUrl === url3) {
      const error = "Oh no, error!";
      const eventData: IDownloadEventData = {
        localUrl: options.localUrl,
        status: EDownloadStatus.ERROR,
        error,
      };
      DownloadService.eventEmitter.emit(EDownloadEvents.DOWNLOAD_STATUS, eventData);
      return { localUrl: options.localUrl, status: EDownloadStatus.ERROR };
    }

    DownloadService.logger.info(`[download] [${options.operationId}] Finished ${options.localUrl}`);

    const eventData: IDownloadEventData = {
      localUrl: options.localUrl,
      status: EDownloadStatus.READY,
    };
    DownloadService.eventEmitter.emit(EDownloadEvents.DOWNLOAD_STATUS, eventData);

    return { localUrl: options.localUrl, status: EDownloadStatus.READY };
  }

  public static async error(options: IDownloadHandlersOptions): Promise<IDownloadEventData> {
    DownloadService.logger.error(`[error] [${options.operationId}] Got an error for ${options.localUrl}. Error: `, options.error);
    return { localUrl: options.localUrl, status: EDownloadStatus.ERROR };
  }

  // TODO: can we come up with an idea of restart here? or should we do thing in the method that calls "callWithLock()"?
  public static async wait(options: IDownloadHandlersOptions): Promise<IDownloadEventData> {
    DownloadService.logger.info(`[wait] [${options.operationId}] Waiting for ${options.localUrl} to download`);

    return new Promise((resolve) => {
      DownloadService.eventEmitter.on(EDownloadEvents.DOWNLOAD_STATUS, (data: IDownloadEventData) => {
        if (data.localUrl !== options.localUrl) return;

        DownloadService.logger.info(`[wait] [${options.operationId}] got event. Data:`, data);

        resolve(data);
      });
    });
  }
}

// CALLS
const test = async () => {
  const result1 = LockService.callWithLock<IDownloadHandlersOptions, IDownloadEventData>({
    key: url1,
    options: { localUrl: url1, operationId: "1" },
    onFree: DownloadService.download,
    onBusy: DownloadService.wait,
    onError: DownloadService.error,
  });
  const result2 = LockService.callWithLock<IDownloadHandlersOptions, IDownloadEventData>({
    key: url1,
    options: { localUrl: url1, operationId: "2" },
    onFree: DownloadService.download,
    onBusy: DownloadService.wait,
    onError: DownloadService.error,
  });
  const result3 = LockService.callWithLock<IDownloadHandlersOptions, IDownloadEventData>({
    key: url1,
    options: { localUrl: url1, operationId: "3" },
    onFree: DownloadService.download,
    onBusy: DownloadService.wait,
    onError: DownloadService.error,
  });
  const result4 = LockService.callWithLock<IDownloadHandlersOptions, IDownloadEventData>({
    key: url2,
    options: { localUrl: url2, operationId: "4" },
    onFree: DownloadService.download,
    onBusy: DownloadService.wait,
    onError: DownloadService.error,
  });
  const result5 = LockService.callWithLock<IDownloadHandlersOptions, IDownloadEventData>({
    key: url3,
    options: { localUrl: url3, operationId: "5" },
    onFree: DownloadService.download,
    onBusy: DownloadService.wait,
    onError: DownloadService.error,
  });

  console.log(await Promise.all([result1, result2, result3, result4, result5]));
};

test();
