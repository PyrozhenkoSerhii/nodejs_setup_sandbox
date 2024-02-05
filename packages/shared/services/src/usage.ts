import { ServiceLocator } from "./service-locator";

export class UsageTestService {
  public static serviceInstanceGetterTest = async () => {
    try {
      const instance = ServiceLocator.getRabbitMq();
      console.log(">> events of rabbitmq instance (checking the getter function): ", instance.eventNames());
    } catch (error) {
      console.error("Wasn't able to get an instance");
    }
  };
}

setTimeout(() => {
  UsageTestService.serviceInstanceGetterTest();
}, 5000);
