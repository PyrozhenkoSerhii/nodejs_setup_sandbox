import "../../aliases";

import express, { Request, Response } from "express";

import { coreConfig } from "@shared/configs";
import { PATH } from "@shared/constants";
import { ESSENTIAL_SERVICE } from "@shared/interfaces";
import { EssentialsService, MongoService, RabbitMqService } from "@shared/services";
import { Logger, checkRequestSource } from "@shared/utils";

class Main {
  private logger = new Logger(Main.name);

  private essentials = new EssentialsService();

  public initialize = async () => {
    try {
      this.essentials.addService(new MongoService(), ESSENTIAL_SERVICE.MONGODB);
      this.essentials.addService(new RabbitMqService(), ESSENTIAL_SERVICE.RABBITMQ);
      await this.essentials.connect();

      const app = express();
      app.use(`/${PATH.HEALTH}`, this.onHealth);
      app.use(`/${PATH.SHUTDOWN}`, checkRequestSource, this.onShutdown);

      app.listen(coreConfig.port, () => {
        this.logger.success(`Express is running on ${coreConfig.port} port`);
      });
    } catch (error) {
      this.logger.error("[initialize] Critical error occurred. Existing", error);
      process.exit(1);
    }
  };

  public onHealth = async (_: Request, res: Response) => {
    const { isHealthy, extra } = await this.essentials.health();
    if (isHealthy) {
      return res.status(200).send({ message: `${coreConfig.serverName} service is healthy` });
    }

    return res.status(500).send({ message: `${coreConfig.serverName} service is down`, extra });
  };

  public onShutdown = async (_: Request, res: Response) => {
    try {
      await this.essentials.disconnect();
      res.status(200).send({ message: `${coreConfig.serverName} service is stopped` });
    } catch (error) {
      res.status(500).send({ message: `Errors while shutting down ${coreConfig.serverName} service` });
    } finally {
      process.exit(1);
    }
  };

  public checkHealthInterval = () => {
    setInterval(async () => {
      this.logger.info("/health response: ");
    }, 60000);
  };
}

new Main().initialize();
