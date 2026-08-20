import { Module } from "@nestjs/common";
import {
  ActivitiesController,
  GroupActivitiesController,
} from "./activities.controller";
import { ActivitiesService } from "./activities.service";

@Module({
  controllers: [ActivitiesController, GroupActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
