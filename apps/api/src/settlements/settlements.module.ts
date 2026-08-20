import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { AuditModule } from "../audit/audit.module";
import { SettlementsController } from "./settlements.controller";
import { SettlementsService } from "./settlements.service";

@Module({
  imports: [ActivitiesModule, AuditModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
