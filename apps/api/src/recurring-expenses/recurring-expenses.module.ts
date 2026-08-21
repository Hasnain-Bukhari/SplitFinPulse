import { Module } from "@nestjs/common";
import { ExpensesModule } from "../expenses/expenses.module";
import { RecurringExpensesController } from "./recurring-expenses.controller";
import { RecurringExpensesService } from "./recurring-expenses.service";

@Module({
  imports: [ExpensesModule],
  controllers: [RecurringExpensesController],
  providers: [RecurringExpensesService],
  exports: [RecurringExpensesService],
})
export class RecurringExpensesModule {}
