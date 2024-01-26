import "../../aliases";

import express from "express";

import { coreConfig } from "@shared/configs";
import { EssentialsService, MongoService } from "@shared/services";
import { Logger } from "@shared/utils";

class Main {
  private logger = new Logger(Main.name);

  private essentials = new EssentialsService();

  public initialize = async () => {
    try {
      this.essentials.addService(new MongoService());
      await this.essentials.connect();

      const app = express();

      app.listen(coreConfig.port, () => {
        this.logger.success(`Express is running on ${coreConfig.port} port`);
      });
    } catch (error) {
      this.logger.error("[initialize] Critical error occurred. Existing");
      process.exit(1);
    }
  };

  public checkHealthInterval = () => {
    setInterval(async () => {
      this.logger.info("/health response: ", await this.essentials.health());
    }, 60000);
  };
}

new Main().initialize();
