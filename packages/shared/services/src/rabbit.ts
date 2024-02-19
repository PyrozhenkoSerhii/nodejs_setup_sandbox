import { EventEmitter } from "stream";

import amqplib, { Options } from "amqplib";

import { coreConfig, getRabbitConfig, livenessConfig } from "@shared/configs";
import { ENVIRONMENT, ESSENTIAL_SERVICE_EVENT, ESSENTIAL_SERVICE_HEALTH, ESSENTIAL_SERVICE_NAME, IEssentialService, IRabbitConfig, RABBIT_QUEUE_NAME } from "@shared/interfaces";
import { Logger, retry } from "@shared/utils";

interface IMessageData {
  message: any;
  queueName: RABBIT_QUEUE_NAME;
}

interface IFailedMessageData extends IMessageData {
  expiresAt: number;
}

export class RabbitMqService extends EventEmitter implements IEssentialService {
  private readonly logger = new Logger(ESSENTIAL_SERVICE_NAME.RABBITMQ, "debug");

  private readonly config = getRabbitConfig();

  private readonly connectOptions: Options.Connect;

  private connection: amqplib.Connection|null = null;

  private health = ESSENTIAL_SERVICE_HEALTH.NOT_INITIALIZED;

  private livelinessTimeout: NodeJS.Timeout|null = null;

  /**
   * The channel that is used for publishing messages and DLX implementation
   */
  private mainChannel: amqplib.Channel|null = null;

  /**
   * The queues that are attached to the main channel for publishing messages
   * Used to reduce load by ensuring the queue only once
   */
  private assertedQueues: Set<RABBIT_QUEUE_NAME> = new Set();

  /**
   * The channels that are created for each separate queue
   * That is needed to allow us controlling prefetch (max unacked messages) per queue (which can be only 1 per channel)
   */
  private subscriberChannels: {[queueName in RABBIT_QUEUE_NAME]?: amqplib.Channel} = {};

  /**
   * The buffer that is used for retry when publishing
   * When the amqp service is unhealthy, we push the message and it's expiration time to the array
   * When the amqp service is healthy again, we publish all messages that are still relevant
   */
  private messageBuffer: Array<IFailedMessageData> = [];

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

  /**
   * Method used for both manual connection and further reconnects
   * @param isReconnect "true" if the first connection that is called manually, "false" otherwise
   * @param attempts how much times we retry the connection
   * @param interval how much MS we wait till retry
   * @param multiplier how much we multiply the interval after each failed attempt
   */
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

  /**
   * Method that is used for manual disconnection from outside
   * It should close all connections gracefully
   */
  public disconnect = async () => {
    try {
      this.onHealth(ESSENTIAL_SERVICE_HEALTH.STOPPED);
      await this.clearConnection(true, true);
    } catch (error) {
      this.handleThrowError("Error while disconnecting");
    }
  };

  /**
   * Method that is used for messages that should be retried after reconnection
   * In case publishMessage method fails, the user of the method may decide to call this method for some messages
   */
  public onFailure = (data: IFailedMessageData) => {
    this.messageBuffer.push(data);
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
    this.retryMessages();
  };

  /**
   * Used to retry sending messages after temporary connection problems
   */
  private retryMessages = () => {
    if (this.messageBuffer.length) {
      const now = Date.now();
      const relevantMessages = this.messageBuffer.filter((m) => m.expiresAt > now); // TODO: consider adding some constant to account for processing time or account for it in ttl already
      this.logger.info(`[onConnected] Got ${this.messageBuffer.length} messages in buffer. ${relevantMessages.length} are relevant`);

      relevantMessages.forEach((m) => {
        this.publishMessage({ queueName: m.queueName, message: m.message });
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
      this.messageBuffer = [];
      this.unsubscribeFromEvents();
      if (this.mainChannel) {
        await this.mainChannel.close();
      }

      await Promise.all(Object.keys(this.subscriberChannels).map(async (key) => {
        const queueName = key as RABBIT_QUEUE_NAME;
        if (this.subscriberChannels[queueName]) {
          try {
            return await this.subscriberChannels[queueName]?.close();
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

  /**
   * Used to send publish a message to the specified queue
   * @returns {boolean} true - if succeeded, false - if got some error
   */
  public publishMessage = async (data: IMessageData): Promise<boolean> => {
    try {
      if (!this.mainChannel) this.handleThrowError("[publishMessage] Unexpected RabbitMQ service state. No channel found");

      if (this.health !== ESSENTIAL_SERVICE_HEALTH.GOOD) this.handleThrowError(`[publishMessage] The service is unhealthy (${this.health}), can't schedule a message`);

      await this.ensureMainQueue(data.queueName);
      this.logger.debug(`Sent message to "${data.queueName}" queue`);
      this.mainChannel.sendToQueue(data.queueName, this.createBufferFromObject(data.message));
      return true;
    } catch (error) {
      // TODO: consider adding some "reason" maybe?
      return false;
    }
  };

  /**
   * The method that is used for subscribing to a specified queue.
   * A new channel will be created for each queue and will have its own
   * processing count which will limit how many "active" (unacked) messages can be present at once
   * If we reached the maxProcessing, no new messages will be received until at least 1 is finished
   * All messages that are failed are sent to DLX queue for further logging
   * Node: it's important to ensure that "assertQueue" in createSubscriber() and ensureMainQueue() methods
   * have the same parameters during creation since there's no way of knowing where it will be created first
   * @param queueName the name of the queue we need to listen to
   * @param maxProcessing how many active processing are allowed at once (util onMessage() is resolved
   * @param onMessage the handler for the message
   * @returns true - if successfully subscribed, false - if got some error
   */
  public createSubscriber = async (queueName: RABBIT_QUEUE_NAME, maxProcessing: number, onMessage: (msg: amqplib.ConsumeMessage | null) => Promise<void>): Promise<boolean> => {
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
          "x-message-ttl": this.config.queuesTTL[queueName],
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

  /**
   * If the queue is attached to DLX, all messages that are nack'ed will be sent to the DLX queue for further logging
   */
  private setupDLX = async () => {
    if (!this.mainChannel) this.handleThrowError("Unexpected RabbitMQ service state. No publisher channel found");

    await this.mainChannel.assertExchange(this.config.dlx.exchangeName, "direct", { durable: true });
    await this.mainChannel.assertQueue(this.config.dlx.queueName, { durable: true });
    await this.mainChannel.bindQueue(this.config.dlx.queueName, this.config.dlx.exchangeName, "#");
  };

  /**
   * The method that is used on the main channel for each queue that we attempt to send to
   * to ensure that it exists (and we ensure it only one)
   * Node: it's important to ensure that "assertQueue" in createSubscriber() and ensureMainQueue() methods
   * have the same parameters during creation since there's no way of knowing where it will be created first
   */
  private ensureMainQueue = async (queueName: RABBIT_QUEUE_NAME) => {
    if (!this.mainChannel) this.handleThrowError("Unexpected RabbitMQ service state. No publisher channel found");

    if (this.assertedQueues.has(queueName)) return;

    await this.mainChannel.assertQueue(queueName, {
      durable: true,
      arguments: {
        "x-queue-type": this.config.queueType,
        "x-dead-letter-exchange": this.config.dlx.exchangeName,
        "x-dead-letter-routing-key": this.config.dlx.routingKey,
        "x-message-ttl": this.config.queuesTTL[queueName],
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
