import { EssentialsService } from "./essentials";

export class UsageTestService {
  public static serviceInstanceGetterTest = async () => {
    try {
      const instance = EssentialsService.getRabbitMq();
      console.log(await instance.health());
    } catch (error) {
      console.error("Wasn't able to get an instance");
    }
  };
}

setTimeout(() => {
  UsageTestService.serviceInstanceGetterTest();
}, 5000);
