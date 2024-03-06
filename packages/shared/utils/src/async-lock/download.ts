import { EventEmitter } from "stream";

import { Logger } from "../logger";
import { sleep } from "../retry";

export interface IDownloadHandlersOptions {
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

export interface IDownloadEventData {
  localUrl: string;
  status: EDownloadStatus;
  error?: any;
}

export class DownloadService extends EventEmitter {
  private static logger = new Logger(DownloadService.name);

  private static eventEmitter = new EventEmitter();

  public static async download(options: IDownloadHandlersOptions): Promise<IDownloadEventData> {
    DownloadService.logger.success(`[download] [${options.operationId}] Started ${options.localUrl}`);
    await sleep(1000);

    // test fail for "C" url
    if (options.localUrl === "C") {
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
