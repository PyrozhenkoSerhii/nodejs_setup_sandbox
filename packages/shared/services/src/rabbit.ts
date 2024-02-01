import amqplib, { Options } from "amqplib";

import { coreConfig, getRabbitConfig } from "@shared/configs";
import { ENVIRONMENT, ESSENTIAL_SERVICE, IEssentialService, IServiceHealthResponse } from "@shared/interfaces";
import { Logger, retry } from "@shared/utils";

export class RabbitMqService implements IEssentialService {
  private readonly logger = new Logger(ESSENTIAL_SERVICE.RABBITMQ, "debug");

  public readonly config = getRabbitConfig();

  public readonly connectOptions: Options.Connect;

  private connection: amqplib.Connection|null = null;

  private isHealthy = false;

  constructor() {
    const protocol = coreConfig.env === ENVIRONMENT.LOCAL ? "amqp" : "amqps";

    const { user, password, host, port, vhost, queueType, queues, healthCheckSeconds } = this.config;

    const vhostPart = vhost ? `/${vhost}` : "";

    this.connectOptions = {
      heartbeat: healthCheckSeconds,
      hostname: host,
      port,
      username: user,
      password,
      vhost: vhostPart,
      protocol,
    };

    this.logger.info("Got the RabbitMQ config: ", { host, port, user, vhost, queueType, queues, healthCheckSeconds });
  }

  public health = async (): Promise<IServiceHealthResponse> => {
    return { isHealthy: this.isHealthy };
  };

  public connect = async (attempts = 6) => {
    try {
      await retry(
        attempts,
        1000,
        1.5,
        async () => {
          this.connection = await amqplib.connect(this.connectOptions);
          this.subscribeToEvents();
          this.onConnected();
        },
        () => {
          this.logger.warn("Reconnection attempt");
        },

      );
    } catch (error) {
      this.handleThrowError("Error while establishing a connection", error);
    }
  };

  public disconnect = async () => {
    try {
      await this.clearConnection(true, true);
    } catch (error) {
      this.handleThrowError("Error while disconnecting");
    }
  };

  private subscribeToEvents = () => {
    if (!this.connection) return;

    this.connection.on("close", this.onDisconnected);
    this.connection.on("error", this.onUnexpectedError);
  };

  private unsubscribeFromEvents = () => {
    if (!this.connection) return;

    this.connection.off("close", this.onDisconnected);
    this.connection.off("error", this.onUnexpectedError);
  };

  private onConnected = () => {
    this.isHealthy = true;
    this.logger.info("[onConnected] event");
  };

  private onDisconnected = () => {
    try {
      this.logger.error("[onDisconnected] event");
      this.clearConnection(false);
      this.connect(12);
    } catch (error) {
      this.logger.error("[onDisconnected] event [catch] ERROR:", error);
    }
  };

  private onUnexpectedError = (error: any) => {
    try {
      // TODO: these should be addressed with care and depending on what
      // errors were actually getting
      // For now, we assume that all of those are critical and trying to reconnect
      this.logger.error("[onUnexpectedError] event. Actual error: ", error);
      this.clearConnection(true);
      this.connect(12);
    } catch (error) {
      this.logger.error("[onUnexpectedError] event [catch] ERROR:", error);
    }
  };

  private clearConnection = async (manualClose = false, shouldThrow = false) => {
    try {
      this.isHealthy = false;
      this.unsubscribeFromEvents();
      if (this.connection && manualClose) {
        await this.connection.close();
      }
    } catch (error) {
      if (shouldThrow) this.handleThrowError("[clearConnection] ERROR: ", error);
      else this.logger.error("[clearConnection] ERROR: ", error);
    } finally {
      this.connection = null;
      this.logger.info("[clearConnection] Ensure closed connection");
    }
  };

  private handleThrowError(message: string, extra?: any): void {
    this.logger.error(message, extra);
    throw new Error(message);
  }
}
