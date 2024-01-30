import { IEssentialService, IHealthSummary, IServiceHealthResponse, IServiceHealthSummaryItem } from "@shared/interfaces";
import { Logger } from "@shared/utils";

export class EssentialsService implements IEssentialService {
  public readonly name = EssentialsService.name;

  private readonly logger = new Logger(EssentialsService.name, "debug");

  private readonly services: IEssentialService[] = [];

  private initialized = false;

  public addService(service: IEssentialService): void {
    if (this.initialized) return this.handleThrowError("[addService] Cannot add service after essentials initialization");

    this.services.push(service);
  }

  public connect = async () => {
    this.initialized = true;

    const results = await Promise.allSettled(this.services.map((s) => s.connect()));

    const summary = {
      total: this.services.length,
      successful: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
      failedServices: results
        .map<IServiceHealthSummaryItem>((r, index) => ({
          isHealthy: r.status === "fulfilled",
          serviceName: this.services[index].name,
          message: r.status === "rejected" ? r.reason.message : undefined,
        }))
        .filter((r) => !r.isHealthy),
    };

    if (summary.failed) {
      this.handleThrowError(`[connect] ${summary.failed}/${summary.total} services failed to launch`, summary.failedServices);
    } else {
      this.logger.success(`[connect] ${summary.successful}/${summary.total} services started successfully`);
    }
  };

  // TODO: any reason to remove services from the list?
  // if we don't, we can still use health and get "false" for all disconnected services
  public disconnect = async () => {
    const results = await Promise.allSettled(this.services.map((s) => s.disconnect()));

    const summary = {
      total: this.services.length,
      successful: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
      failedServices: results
        .map<IServiceHealthSummaryItem>((r, index) => ({
          isHealthy: r.status === "fulfilled",
          serviceName: this.services[index].name,
          message: r.status === "rejected" ? r.reason.message : undefined,
        }))
        .filter((r) => !r.isHealthy),
    };

    if (summary.failed) {
      this.logger.error(`[disconnect] ${summary.failed}/${summary.total} services failed to stop gracefully`, summary.failedServices);
    } else {
      this.logger.success(`[disconnect] ${summary.successful}/${summary.total} services stopped gracefully`);
    }
  };

  public health = async (): Promise<IServiceHealthResponse> => {
    const summary = await this.createHealthSummary();
    this.logger.debug(summary);

    return { isHealthy: !summary.unhealthyCount, extra: summary };
  };

  private createHealthSummary = async (): Promise<IHealthSummary> => {
    let unhealthyCount = 0;

    const details = await Promise.all(this.services.map<Promise<IServiceHealthSummaryItem>>(async (s) => {
      const { isHealthy } = await s.health();
      if (!isHealthy) unhealthyCount++;

      return {
        isHealthy,
        serviceName: s.name,
      };
    }));

    return {
      unhealthyCount,
      details,
    };
  };

  private handleThrowError(message: string, extra?: any): void {
    this.logger.error(message, extra);
    throw new Error(message);
  }
}
