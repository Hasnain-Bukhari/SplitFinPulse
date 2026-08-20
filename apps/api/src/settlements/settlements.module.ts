import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { AuditModule } from "../audit/audit.module";
import { SettlementsController } from "./settlements.controller";
import { SettlementsService } from "./settlements.service";
import { CurrenciesModule } from "../currencies/currencies.module";

@Module({
  imports: [ActivitiesModule, AuditModule, CurrenciesModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
