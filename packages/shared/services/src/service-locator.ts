import { EventEmitter } from "stream";

import { ESSENTIAL_SERVICE_NAME, ESSENTIAL_SERVICE_EVENT, ESSENTIAL_SERVICE_HEALTH, IEssentialService } from "@shared/interfaces";
import { Logger } from "@shared/utils";

import { MongoService } from "./mongo";
import { RabbitMqService } from "./rabbit";

type IServicesMap = { [key in ESSENTIAL_SERVICE_NAME]?: IEssentialService };

type IHealthSummaryMap = {[key in ESSENTIAL_SERVICE_NAME]?: ESSENTIAL_SERVICE_HEALTH};

interface IServiceHealthSummaryItem {
  serviceName: string;
  isHealthy: boolean;
  message?: string;
}

export class ServiceLocator extends EventEmitter {
  private static logger = new Logger(ServiceLocator.name, "debug");

  private static services: IServicesMap = {};

  private static initialized = false;

  public static healthSummary: IHealthSummaryMap = {};

  /**
   * Should be called before "connect()" method to add services for the app
   * @param service the service (external dependency) that should be initialized before the startup
   * @param name name of the service for health and other metrics
   */
  public static addService(service: IEssentialService, name: ESSENTIAL_SERVICE_NAME): void {
    if (ServiceLocator.initialized) return ServiceLocator.handleThrowError("[addService] Cannot add service after essentials initialization");

    ServiceLocator.services[name] = service;

    service.on(ESSENTIAL_SERVICE_EVENT.HEALTH_CHANGE, (health) => ServiceLocator.onHealthChange(name, health));
  }

  /**
   * Used to start all services that were provided beforehand
   * If some services weren't able to start, throws an error that leads to process.exit(1)
   */
  public static connect = async () => {
    ServiceLocator.initialized = true;

    const serviceEntries = Object.entries(ServiceLocator.services).filter((entry): entry is [ESSENTIAL_SERVICE_NAME, IEssentialService] => entry[1] !== undefined);
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
      ServiceLocator.handleThrowError(`[connect] ${summary.failed}/${summary.total} services failed to launch`, summary.failedServices);
    } else {
      ServiceLocator.logger.success(`[connect] ${summary.successful}/${summary.total} services started successfully`);
    }
  };

  /**
   * Used to gracefully stop all services
   * Mainly used for the shutdown
   */
  public static disconnect = async () => {
    const serviceEntries = Object.entries(ServiceLocator.services).filter((entry): entry is [ESSENTIAL_SERVICE_NAME, IEssentialService] => entry[1] !== undefined);
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
      ServiceLocator.logger.error(`[disconnect] ${summary.failed}/${summary.total} services failed to stop gracefully`, summary.failedServices);
    } else {
      ServiceLocator.logger.success(`[disconnect] ${summary.successful}/${summary.total} services stopped gracefully`);
    }
  };

  /**
   * @returns a RabbitMQ instance that can be used to create a channel, etc
   */
  public static getRabbitMQ = (): RabbitMqService => {
    const service = ServiceLocator.services[ESSENTIAL_SERVICE_NAME.RABBITMQ];
    if (!service) ServiceLocator.handleThrowError("[getRabbitMq] Service is not initialized");

    if (!(service instanceof RabbitMqService)) ServiceLocator.handleThrowError("[getRabbitMq] Service is not an instance of RabbitMqService");

    return service;
  };

  /**
   * @returns a MongoDB instance if needed
   */
  public static getMongoDB = (): MongoService => {
    const service = ServiceLocator.services[ESSENTIAL_SERVICE_NAME.MONGODB];
    if (!service) ServiceLocator.handleThrowError("[getMongoDB] Service is not initialized");

    if (!(service instanceof MongoService)) ServiceLocator.handleThrowError("[getMongoDB] Service is not an instance of MongoService");

    return service;
  };

  private static handleThrowError(message: string, extra: any = ""): never {
    ServiceLocator.logger.error(message, extra);

    throw new Error(message);
  }

  private static onHealthChange = async (name: ESSENTIAL_SERVICE_NAME, health: ESSENTIAL_SERVICE_HEALTH) => {
    this.healthSummary[name] = health;
    if (health === ESSENTIAL_SERVICE_HEALTH.CRITICAL) {
      ServiceLocator.logger.error(`Stopping all services and exiting due to ${name} having a "${health}" health`);
      await ServiceLocator.disconnect();
      await ServiceLocator.report();
      process.exit(1);
    }
  };

  private static report = async () => {
    // report the failures here
  };
}
