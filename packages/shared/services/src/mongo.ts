import mongoose from "mongoose";

import { getMongoConfig } from "@shared/configs";
import { IEssentialService, IMongoConfig, IServiceHealthResponse } from "@shared/interfaces";
import { Logger, retry } from "@shared/utils";

export class MongoService implements IEssentialService {
  private readonly logger = new Logger(MongoService.name, "debug");

  private readonly config: IMongoConfig;

  private readonly uri: string;

  public readonly name = MongoService.name;

  private isHealthy = false;

  private connectedOnce = false;

  constructor() {
    this.config = getMongoConfig();

    const { user, password, host, port, db } = this.config;

    this.uri = `mongodb://${user}:${password}@${host}:${port}/${db}`;

    this.logger.info("Got the MongoDB config: ", { user, host, port, db });
  }

  public health = async (): Promise<IServiceHealthResponse> => {
    return { isHealthy: this.isHealthy };
  };

  public connect = async () => {
    mongoose.connection.on("connected", this.onConnected);
    mongoose.connection.on("disconnected", this.onDisconnected);

    try {
      await retry(
        5,
        100, // aside from this 100ms, mongo will wait for "serverSelectionTimeoutMS", see this.config.options
        1.5,
        async () => {
          await mongoose.connect(this.uri, this.config.options);
          this.connectedOnce = true;
        },
        () => {
          this.logger.warn("Retrying to connect to the MongoDB");
        },
      );
    } catch (error) {
      this.handleThrowError("Error while establishing a connection");
    }
  };

  private onConnected = () => {
    this.isHealthy = true;
    this.logger.info("Connected event");
  };

  private onDisconnected = () => {
    if (!this.connectedOnce) return;

    /**
     * There's no need for manual reconnection here
     * mongoose has a built-in functionality for it that will attempt to connect again
     * and if succeed the "connected" event will be called and the service will healthy again
     */
    this.isHealthy = false;
    this.logger.error("Disconnected event");
  };

  private handleThrowError(message: string, extra?: any): void {
    this.logger.error(message, extra);
    throw new Error(message);
  }
}
