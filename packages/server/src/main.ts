import "../../aliases";

import express, { Request, Response } from "express";

import { coreConfig } from "@shared/configs";
import { PATH } from "@shared/constants";
import { ESSENTIAL_SERVICE_NAME } from "@shared/interfaces";
import { ServiceLocator, MongoService, RabbitMqService } from "@shared/services";
import { Logger, checkRequestSource } from "@shared/utils";

class Main {
  private logger = new Logger(Main.name);

  public initialize = async () => {
    try {
      ServiceLocator.addService(new MongoService(), ESSENTIAL_SERVICE_NAME.MONGODB);
      ServiceLocator.addService(new RabbitMqService(), ESSENTIAL_SERVICE_NAME.RABBITMQ);
      await ServiceLocator.connect();

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

  public onHealth = (_: Request, res: Response) => {
    return res.status(200).send({ appName: coreConfig.appName, healthSummary: ServiceLocator.healthSummary });
  };

  public onShutdown = async (_: Request, res: Response) => {
    try {
      await ServiceLocator.disconnect();
      res.status(200).send({ message: `${coreConfig.appName} app is stopped` });
    } catch (error) {
      res.status(500).send({ message: `Errors while shutting down ${coreConfig.appName} app` });
    } finally {
      process.exit(1);
    }
  };
}

new Main().initialize();
