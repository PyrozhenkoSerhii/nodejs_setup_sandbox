import AsyncLock from "async-lock";

interface ILockableCall<T extends Object, C> {
  key: string;
  options: T;
  onFree: (options: T) => Promise<C>;
  onBusy: (options: T) => Promise<C>;
  onError: (options: T) => Promise<C>;
}

export class LockService {
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
