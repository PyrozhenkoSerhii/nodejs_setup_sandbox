import "../../aliases";

import express from "express";

import { coreConfig } from "@shared/configs";
import { Logger } from "@shared/utils";

class Main {
  private logger = new Logger(Main.name);

  constructor() {
    const app = express();

    app.listen(coreConfig.port, () => {
      this.logger.success(`Express is running on ${coreConfig.port} port`);
    });
  }
}

new Main();
