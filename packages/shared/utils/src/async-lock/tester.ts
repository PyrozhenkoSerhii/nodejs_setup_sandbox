import { DownloadService, IDownloadEventData, IDownloadHandlersOptions } from "./download";
import { LockService } from "./lock";

const url1 = "A";
const url2 = "B";
const url3 = "C";

// CALLS
export const testLockFunctionality = async () => {
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
