import { EventEmitter } from "stream";

import amqplib, { Options } from "amqplib";

import { coreConfig, getRabbitConfig, livenessConfig } from "@shared/configs";
import { ENVIRONMENT, ESSENTIAL_SERVICE_EVENT, ESSENTIAL_SERVICE_HEALTH, ESSENTIAL_SERVICE_NAME, IEssentialService } from "@shared/interfaces";
import { Logger, retry } from "@shared/utils";

export class RabbitMqService extends EventEmitter implements IEssentialService {
  private readonly logger = new Logger(ESSENTIAL_SERVICE_NAME.RABBITMQ, "debug");

  private readonly config = getRabbitConfig();

  private readonly connectOptions: Options.Connect;

  private connection: amqplib.Connection|null = null;

  private channel: amqplib.Channel|null = null;

  private assertedQueues: Set<string> = new Set();

  private health = ESSENTIAL_SERVICE_HEALTH.NOT_INITIALIZED;

  private livelinessTimeout: NodeJS.Timeout|null = null;

  constructor() {
    super();

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

  public connect = async (isReconnect = false, attempts = 5, interval = 100, multiplier = 1.5) => {
    try {
      this.logger.info("Trying to connect");

      await retry(
        attempts,
        interval, // aside from this interval, amqp will wait for "connectionTimeoutMs", see this.config
        multiplier,
        async () => {
          this.connection = await amqplib.connect(this.connectOptions, { timeout: this.config.connectionTimeoutMs });
          this.channel = await this.connection.createChannel();
          this.subscribeToEvents();
          this.onConnected();
        },
        () => {
          this.logger.warn("Reconnection attempt");
        },

      );
    } catch (error) {
      if (!isReconnect) {
        this.handleThrowError("Error while establishing a connection", error);
      }
    }
  };

  public disconnect = async () => {
    try {
      this.onHealth(ESSENTIAL_SERVICE_HEALTH.STOPPED);
      await this.clearConnection(true, true);
    } catch (error) {
      this.handleThrowError("Error while disconnecting");
    }
  };

  public onFailure = () => {
    // TODO: come up with a strategy and implement it
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
    this.onHealth(ESSENTIAL_SERVICE_HEALTH.GOOD);
    this.cancelLivelinessTimeout();
    this.logger.info("[onConnected] event");
  };

  private onDisconnected = () => {
    try {
      this.onHealth(ESSENTIAL_SERVICE_HEALTH.BAD);
      this.setupLivelinessTimeout();
      this.logger.error("[onDisconnected] event");
      // manual reconnect cycle
      this.clearConnection(false);
      this.connect(true, 10, 1000, 1.5);
    } catch (error) {
      this.logger.error("[onDisconnected] event [catch] ERROR:", error);
    }
  };

  private onUnexpectedError = (error: any) => {
    try {
      // TODO: these should be addressed with care and depending on what
      // errors were actually getting
      // For now, we assume that all of those are critical and trying to reconnect
      this.onHealth(ESSENTIAL_SERVICE_HEALTH.BAD);
      this.setupLivelinessTimeout();
      this.logger.error("[onUnexpectedError] event. Actual error: ", error);
      // manual reconnect cycle
      this.clearConnection(true);
      this.connect(true, 10, 1000, 1.5);
    } catch (error) {
      this.logger.error("[onUnexpectedError] event [catch] ERROR:", error);
    }
  };

  private clearConnection = async (manualClose = false, shouldThrow = false) => {
    try {
      this.unsubscribeFromEvents();
      if (this.channel) {
        await this.channel.close();
      }

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

  private setupLivelinessTimeout = () => {
    const timeout = livenessConfig.default.server.RabbitMqService.maxReconnectMs;
    this.logger.warn(`[setupLivelinessTimeout] The service will become critical in ${timeout}ms`);
    this.livelinessTimeout = setTimeout(() => {
      this.logger.error("[setupLivelinessTimeout] [callback] The health is critical!");
      this.onHealth(ESSENTIAL_SERVICE_HEALTH.CRITICAL);
    }, timeout);
  };

  private cancelLivelinessTimeout = () => {
    if (this.livelinessTimeout) {
      clearTimeout(this.livelinessTimeout);
      this.logger.info("[cancelLivelinessTimeout]");
    }
  };

  private onHealth = (health: ESSENTIAL_SERVICE_HEALTH) => {
    this.health = health;
    this.emit(ESSENTIAL_SERVICE_EVENT.HEALTH_CHANGE, this.health);
  };

  // TODO: handle failed messages, tie them to the reconnect logic and ttl
  public publishMessage = async (queueName: string, data: any): Promise<boolean> => {
    try {
      if (!this.channel) this.handleThrowError("Unexpected RabbitMQ service state. No channel found");

      await this.ensureQueue(queueName);
      this.channel.sendToQueue(queueName, this.createBufferFromObject(data));
      return true;
    } catch (error) {
      this.logger.error("[publishMessage] Failed", error);
      return false;
    }
  };

  async createSubscriber(queueName: string, maxProcessing: string, onMessage: (msg: amqplib.ConsumeMessage | null) => void): Promise<boolean> {
    try {
      if (!this.channel) this.handleThrowError("Unexpected RabbitMQ service state. No channel found");

      await this.ensureQueue(queueName);

      this.channel.consume(queueName, (message) => {
        if (!message || !message.content) return;

        onMessage(message);
        if (message) {
          this.channel?.ack(message);
        }
      }, { noAck: false });
    } catch (error) {
      this.logger.error("[createSubscriber] Failed", error);
      return false;
    }
  }

  private ensureQueue = async (queueName: string) => {
    if (!this.channel) this.handleThrowError("Unexpected RabbitMQ service state. No channel found");

    if (this.assertedQueues.has(queueName)) return;

    await this.channel.assertQueue(queueName, {
      durable: true,
      arguments: {
        "x-queue-type": this.config.queueType,
      },
    });
    this.assertedQueues.add(queueName);
  };

  private createBufferFromObject = (obj: any): Buffer => {
    return Buffer.from(JSON.stringify(obj));
  };

  private handleThrowError(message: string, extra: any = ""): never {
    this.logger.error(message, extra);
    throw new Error(message);
  }
}
