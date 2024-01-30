import "../../aliases";

import express from "express";

import { coreConfig } from "@shared/configs";
import { PATH } from "@shared/constants";
import { EssentialsService, MongoService, RabbitMqService } from "@shared/services";
import { Logger } from "@shared/utils";

class Main {
  private logger = new Logger(Main.name);

  private essentials = new EssentialsService();

  public initialize = async () => {
    try {
      this.essentials.addService(new MongoService());
      this.essentials.addService(new RabbitMqService());
      await this.essentials.connect();

      const app = express();
      app.use(`/${PATH.HEALTH}`, this.onHealth);

      app.listen(coreConfig.port, () => {
        this.logger.success(`Express is running on ${coreConfig.port} port`);
      });
    } catch (error) {
      this.logger.error("[initialize] Critical error occurred. Existing");
      process.exit(1);
    }
  };

  // TODO: add types
  public onHealth = async (_: any, res: any) => {
    const { isHealthy, extra } = await this.essentials.health();
    if (isHealthy) {
      return res.status(200).send({ message: `${coreConfig.serverName} service is healthy` });
    }

    return res.status(500).send({ message: `${coreConfig.serverName} service id DOWN`, extra });
  };

  public checkHealthInterval = () => {
    setInterval(async () => {
      this.logger.info("/health response: ");
    }, 60000);
  };
}

new Main().initialize();
