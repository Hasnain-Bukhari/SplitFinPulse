import { Module } from "@nestjs/common";
import { ExpensesController } from "./expenses.controller";
import { ExpenseAccessService } from "./expense-access.service";
import { ExpensesService } from "./expenses.service";

@Module({
  controllers: [ExpensesController],
  providers: [ExpenseAccessService, ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
