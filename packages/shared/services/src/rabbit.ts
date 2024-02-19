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

  // the channel that is used for publishing messages and DLX
  private mainChannel: amqplib.Channel|null = null;

  // channels that are used for separate consumers = queues
  private subscriberChannels: {[queueName: string]: amqplib.Channel} = {};

  private messageBuffer: Array<{ queueName: string, message: any; expiresAt: number }> = [];

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
          this.mainChannel = await this.connection.createChannel();
          this.setupDLX();
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
    if (this.messageBuffer.length) {
      const now = Date.now();
      const relevantMessages = this.messageBuffer.filter((m) => m.expiresAt > now); // TODO: consider adding some constant to account for processing time or account for it in ttl already
      this.logger.info(`[onConnected] Got ${this.messageBuffer.length} messages in buffer. ${relevantMessages.length} are relevant`);

      relevantMessages.forEach((m) => {
        this.publishMessage(m.queueName, m.message, undefined); // not retrying anymore
      });
    }
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
      if (this.mainChannel) {
        await this.mainChannel.close();
      }

      await Promise.all(Object.keys(this.subscriberChannels).map(async (key) => {
        if (this.subscriberChannels[key]) {
          try {
            return await this.subscriberChannels[key].close();
          } catch (error) {
            this.logger.error(`[clearConnection] Error while closing the subscriber channel "${key}"`);
          }
        }
      }));

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
  public publishMessage = async (queueName: string, data: any, ttl?: number): Promise<boolean> => {
    try {
      if (!this.mainChannel) this.handleThrowError("Unexpected RabbitMQ service state. No channel found");

      if (this.health !== ESSENTIAL_SERVICE_HEALTH.GOOD) this.handleThrowError(`The service is unhealthy (${this.health}), can't schedule a message`);

      await this.ensureMainQueue(queueName);
      this.mainChannel.sendToQueue(queueName, this.createBufferFromObject(data));
      return true;
    } catch (error) {
      this.logger.error("[publishMessage] Failed", error);

      if (ttl) {
        this.messageBuffer.push({ queueName, message: data, expiresAt: Date.now() + ttl });
        this.logger.warn(`Added new message to the buffer with ttl ${ttl}`);
      }

      return false;
    }
  };

  public createSubscriber = async (queueName: string, maxProcessing: number, onMessage: (msg: amqplib.ConsumeMessage | null) => Promise<void>): Promise<boolean> => {
    try {
      if (!this.connection) this.handleThrowError("Unexpected RabbitMQ service state. No connection found");

      const subscriberChannel = await this.connection.createChannel();
      // setting the max amount of the unacknowledged messages on the channel
      // if everything is okay, the channel should ack() the message
      // you should nack() with requeue if the error is recoverable (TODO: need more info about the error happened in onMessage())
      // you should nack() without requeue and send message to DLX if the error is fatal
      subscriberChannel.prefetch(maxProcessing);
      await subscriberChannel.assertQueue(queueName, {
        durable: true,
        arguments: {
          "x-queue-type": this.config.queueType,
          "x-dead-letter-exchange": this.config.dlx.exchangeName,
          "x-dead-letter-routing-key": this.config.dlx.routingKey,
        },
      });

      subscriberChannel.consume(queueName, async (message) => {
        if (!message?.content) return;

        try {
          await onMessage(message);
          subscriberChannel.ack(message);
        } catch (error) {
          // TODO: depending on the actual error from the onMessage() we may consider adjusting "requeue" variable
          const requeue = false;
          subscriberChannel.nack(message, false, requeue);
          this.logger.error(`Error while handling the message for "${queueName}" queue`, error);
        }
      }, { noAck: false });

      return true;
    } catch (error) {
      this.logger.error("[createSubscriber] Failed", error);
      return false;
    }
  };

  private setupDLX = async () => {
    if (!this.mainChannel) this.handleThrowError("Unexpected RabbitMQ service state. No publisher channel found");

    await this.mainChannel.assertExchange(this.config.dlx.exchangeName, "direct", { durable: true });
    await this.mainChannel.assertQueue(this.config.dlx.queueName, { durable: true });
    await this.mainChannel.bindQueue(this.config.dlx.queueName, this.config.dlx.exchangeName, "#");
  };

  private ensureMainQueue = async (queueName: string) => {
    if (!this.mainChannel) this.handleThrowError("Unexpected RabbitMQ service state. No publisher channel found");

    if (this.assertedQueues.has(queueName)) return;

    await this.mainChannel.assertQueue(queueName, {
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
