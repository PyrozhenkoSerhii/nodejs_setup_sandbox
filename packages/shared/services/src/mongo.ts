import { EventEmitter } from "stream";

import mongoose from "mongoose";

import { getMongoConfig, livenessConfig } from "@shared/configs";
import { ESSENTIAL_SERVICE_NAME, ESSENTIAL_SERVICE_EVENT, ESSENTIAL_SERVICE_HEALTH, IEssentialService } from "@shared/interfaces";
import { Logger, retry } from "@shared/utils";

export class MongoService extends EventEmitter implements IEssentialService {
  private readonly logger = new Logger(ESSENTIAL_SERVICE_NAME.MONGODB, "debug");

  private readonly config = getMongoConfig();

  private readonly uri: string;

  private health = ESSENTIAL_SERVICE_HEALTH.NOT_INITIALIZED;

  private livelinessTimeout: NodeJS.Timeout|null = null;

  private connectedOnce = false;

  constructor() {
    super();

    const { user, password, host, port, db } = this.config;

    this.uri = `mongodb://${user}:${password}@${host}:${port}/${db}`;

    this.logger.info("Got the MongoDB config: ", { user, host, port, db });
  }

  public connect = async () => {
    try {
      this.logger.info("Trying to connect");

      // it's important to subscribe to events before connecting
      this.subscribeToEvents();

      await retry(
        5,
        100, // aside from this 100ms, mongo will wait for "serverSelectionTimeoutMS", see this.config.options
        1.5,
        async () => {
          await mongoose.connect(this.uri, this.config.options);
          this.connectedOnce = true;
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
      this.onHealth(ESSENTIAL_SERVICE_HEALTH.STOPPED);
      this.clearConnection();
    } catch (error) {
      this.handleThrowError("Error while disconnecting");
    }
  };

  private subscribeToEvents = () => {
    mongoose.connection.on("connected", this.onConnected);
    mongoose.connection.on("disconnected", this.onDisconnected);
  };

  private unsubscribeFromEvents = () => {
    mongoose.connection.off("connected", this.onConnected);
    mongoose.connection.off("disconnected", this.onDisconnected);
  };

  private onConnected = () => {
    this.onHealth(ESSENTIAL_SERVICE_HEALTH.GOOD);
    this.cancelLivelinessTimeout();
    this.logger.info("[onConnected] event");
  };

  private onDisconnected = () => {
    if (!this.connectedOnce) return;

    /**
     * There's no need for manual reconnection here
     * mongoose has a built-in functionality for it that will attempt to connect again
     * and if succeed the "connected" event will be called and the service will healthy again
     */
    this.onHealth(ESSENTIAL_SERVICE_HEALTH.BAD);
    this.setupLivelinessTimeout();
    this.logger.error("[onDisconnected] event");
  };

  private clearConnection = () => {
    try {
      this.unsubscribeFromEvents();
      mongoose.disconnect();
    } catch (error) {
      this.handleThrowError("[clearConnection] ERROR: ", error);
    } finally {
      this.connectedOnce = false;
      this.logger.info("[clearConnection] Ensure closed connection");
    }
  };

  private setupLivelinessTimeout = () => {
    const timeout = livenessConfig.default.server.MongoDBService.maxReconnectMs;
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

  private handleThrowError(message: string, extra?: any): void {
    this.logger.error(message, extra);
    throw new Error(message);
  }
}
