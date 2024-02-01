import { ESSENTIAL_SERVICE, IEssentialService, IHealthSummary, IServiceHealthResponse, IServiceHealthSummaryItem } from "@shared/interfaces";
import { Logger } from "@shared/utils";

import { RabbitMqService } from "./rabbit";

export class EssentialsService implements IEssentialService {
  private static logger = new Logger(EssentialsService.name, "debug");

  private static services: { [key in ESSENTIAL_SERVICE]?: IEssentialService } = {};

  private initialized = false;

  public addService(service: IEssentialService, name: ESSENTIAL_SERVICE): void {
    if (this.initialized) return EssentialsService.handleThrowError("[addService] Cannot add service after essentials initialization");

    EssentialsService.services[name] = service;
  }

  public connect = async () => {
    this.initialized = true;

    const serviceEntries = Object.entries(EssentialsService.services).filter((entry): entry is [ESSENTIAL_SERVICE, IEssentialService] => entry[1] !== undefined);
    const results = await Promise.allSettled(serviceEntries.map(([_, service]) => service.connect()));

    const summary = {
      total: serviceEntries.length,
      successful: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
      failedServices: results.map<IServiceHealthSummaryItem>((r, index) => ({
        isHealthy: r.status === "fulfilled",
        serviceName: serviceEntries[index][0], // Use the enum key as the serviceName
        message: r.status === "rejected" ? (r as PromiseRejectedResult).reason.message : undefined,
      })).filter((r) => !r.isHealthy),
    };

    if (summary.failed) {
      EssentialsService.handleThrowError(`[connect] ${summary.failed}/${summary.total} services failed to launch`, summary.failedServices);
    } else {
      EssentialsService.logger.success(`[connect] ${summary.successful}/${summary.total} services started successfully`);
    }
  };

  // TODO: any reason to remove services from the list?
  // if we don't, we can still use health and get "false" for all disconnected services
  public disconnect = async () => {
    const serviceEntries = Object.entries(EssentialsService.services).filter((entry): entry is [ESSENTIAL_SERVICE, IEssentialService] => entry[1] !== undefined);
    const results = await Promise.allSettled(serviceEntries.map(([_, service]) => service.disconnect()));

    const summary = {
      total: serviceEntries.length,
      successful: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
      failedServices: results.map<IServiceHealthSummaryItem>((r, index) => ({
        isHealthy: r.status === "fulfilled",
        serviceName: serviceEntries[index][0], // Use the enum key as the serviceName
        message: r.status === "rejected" ? (r as PromiseRejectedResult).reason.message : undefined,
      })).filter((r) => !r.isHealthy),
    };

    if (summary.failed) {
      EssentialsService.logger.error(`[disconnect] ${summary.failed}/${summary.total} services failed to stop gracefully`, summary.failedServices);
    } else {
      EssentialsService.logger.success(`[disconnect] ${summary.successful}/${summary.total} services stopped gracefully`);
    }
  };

  public health = async (): Promise<IServiceHealthResponse> => {
    const summary = await this.createHealthSummary();
    EssentialsService.logger.debug(summary);

    return { isHealthy: !summary.unhealthyCount, extra: summary };
  };

  private createHealthSummary = async (): Promise<IHealthSummary> => {
    let unhealthyCount = 0;

    const serviceEntries = Object.entries(EssentialsService.services)
      .filter((entry): entry is [ESSENTIAL_SERVICE, IEssentialService] => entry[1] !== undefined);

    const details = await Promise.all(
      serviceEntries.map<Promise<IServiceHealthSummaryItem>>(async ([serviceName, service]) => {
        const { isHealthy } = await service.health();
        if (!isHealthy) unhealthyCount++;

        return {
          isHealthy,
          serviceName,
        };
      }),
    );

    return {
      unhealthyCount,
      details,
    };
  };

  public static getRabbitMq = (): RabbitMqService => {
    const service = EssentialsService.services[ESSENTIAL_SERVICE.RABBITMQ];
    if (!service) EssentialsService.handleThrowError("[getRabbitMq] Service is not initialized");

    if (!(service instanceof RabbitMqService)) this.handleThrowError("[getRabbitMq] Service is not an instance of RabbitMqService");

    return service;
  };

  private static handleThrowError(message: string, extra?: any): never {
    if (extra) {
      this.logger.error(message, extra);
    } else {
      this.logger.error(message);
    }

    throw new Error(message);
  }
}
