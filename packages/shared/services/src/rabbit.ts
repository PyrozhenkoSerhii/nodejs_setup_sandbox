import amqplib from "amqplib";

import { coreConfig, getRabbitConfig } from "@shared/configs";
import { ENVIRONMENT, IEssentialService, IServiceHealthResponse } from "@shared/interfaces";
import { Logger } from "@shared/utils";

export class RabbitMqService implements IEssentialService {
  private readonly logger = new Logger(RabbitMqService.name, "debug");

  public readonly name = RabbitMqService.name;

  public readonly config = getRabbitConfig();

  private readonly uri: string;

  private connection: amqplib.Connection|null = null;

  private isHealthy = false;

  private connectedOnce = false;

  constructor() {
    const protocol = coreConfig.env === ENVIRONMENT.LOCAL ? "amqp" : "amqps";

    const { user, password, host, port, vhost, queueType, queues } = this.config;

    const vhostPart = vhost ? `/${vhost}` : "";

    this.uri = `${protocol}://${user}:${password}@${host}:${port}/${vhostPart}`;

    this.logger.info("Got the RabbitMQ config: ", { host, port, user, vhost, queueType, queues });
  }

  public health = async (): Promise<IServiceHealthResponse> => {
    return { isHealthy: this.isHealthy };
  };

  public connect = async () => {
    try {
      this.connection = await amqplib.connect(this.uri);
      this.connectedOnce = true;
      this.isHealthy = true;
      this.logger.info("Connected");
    } catch (error) {
      this.handleThrowError("Error while establishing a connection", error);
    }
  };

  private handleThrowError(message: string, extra?: any): void {
    this.logger.error(message, extra);
    throw new Error(message);
  }
}
