import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { AuditModule } from "../audit/audit.module";
import { ExpensesController } from "./expenses.controller";
import { ExpenseAccessService } from "./expense-access.service";
import { ExpensesService } from "./expenses.service";

@Module({
  imports: [ActivitiesModule, AuditModule],
  controllers: [ExpensesController],
  providers: [ExpenseAccessService, ExpensesService],
  exports: [ExpenseAccessService, ExpensesService],
})
export class ExpensesModule {}
