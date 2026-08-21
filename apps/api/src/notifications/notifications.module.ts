import { Global, Module } from "@nestjs/common";
import {
  NotificationsController,
  PushDevicesController,
} from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Global()
@Module({
  controllers: [NotificationsController, PushDevicesController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
