import mongoose from "mongoose";

import { getMongoConfig } from "@shared/configs";
import { IEssentialService, IServiceHealthResponse } from "@shared/interfaces";
import { Logger, retry } from "@shared/utils";

export class MongoService implements IEssentialService {
  private readonly logger = new Logger(MongoService.name, "debug");

  public readonly name = MongoService.name;

  private readonly config = getMongoConfig();

  private readonly uri: string;

  private isHealthy = false;

  private connectedOnce = false;

  constructor() {
    const { user, password, host, port, db } = this.config;

    this.uri = `mongodb://${user}:${password}@${host}:${port}/${db}`;

    this.logger.info("Got the MongoDB config: ", { user, host, port, db });
  }

  public health = async (): Promise<IServiceHealthResponse> => {
    return { isHealthy: this.isHealthy };
  };

  public connect = async () => {
    try {
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
      this.handleThrowError("Error while establishing a connection");
    }
  };

  public disconnect = async () => {
    try {
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
    this.isHealthy = true;
    this.logger.info("[onConnected] event");
  };

  private onDisconnected = () => {
    if (!this.connectedOnce) return;

    /**
     * There's no need for manual reconnection here
     * mongoose has a built-in functionality for it that will attempt to connect again
     * and if succeed the "connected" event will be called and the service will healthy again
     */
    this.isHealthy = false;
    this.logger.error("[onDisconnected] event");
  };

  private clearConnection = () => {
    try {
      this.isHealthy = false;
      this.unsubscribeFromEvents();
      mongoose.disconnect();
    } catch (error) {
      this.handleThrowError("[clearConnection] ERROR: ", error);
    } finally {
      this.connectedOnce = false;
      this.logger.info("[clearConnection] Ensure closed connection");
    }
  };

  private handleThrowError(message: string, extra?: any): void {
    this.logger.error(message, extra);
    throw new Error(message);
  }
}
