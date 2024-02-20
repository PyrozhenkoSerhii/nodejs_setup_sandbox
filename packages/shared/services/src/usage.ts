import { RABBIT_QUEUE_ALIAS } from "@shared/interfaces";
import { Logger } from "@shared/utils";

import { ServiceLocator } from "./service-locator";

export class UsageTestService {
  private static logger = new Logger(UsageTestService.name, "debug");

  public static serviceInstanceGetterTest = async () => {
    try {
      const instance = ServiceLocator.getRabbitMQ();
      const queueAlias: RABBIT_QUEUE_ALIAS = "TEST";
      await instance.createSubscriber(queueAlias, 5, async (message) => {
        UsageTestService.logger.debug("[serviceInstanceGetterTest] Got message: ", message);
      });

      await instance.publishMessage({ message: "some message", queueAlias: "TEST" });
      UsageTestService.logger.debug("[serviceInstanceGetterTest] Send message");
    } catch (error) {
      console.error("[serviceInstanceGetterTest] Wasn't able to get an instance");
    }
  };
}

setTimeout(() => {
  UsageTestService.serviceInstanceGetterTest();
}, 5000);
